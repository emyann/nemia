/**
 * One step file, read and written: `parseWorkflow` reads its frontmatter into a `Workflow` through each key's reader, and
 * `renderStep` writes one back, the parser run backwards; `loopOf` and `roundsOf` read the one edge that points backwards.
 */
import {
  AGENTS_FOLDER,
  DEFAULT_ROUNDS,
  isStepKey,
  refuse,
  REFUSED,
  splitFrontmatter,
  STEP_KEYS,
  type StepAgent,
  type StepKey,
  type StepOutput,
  type Workflow,
  WorkflowError,
} from '../step/step.ts';
import { fenceReach } from 'agent-runtime/vocabulary';
import { DEFAULT_HARNESS, isRemoteHarness, remoteRefusal } from '../harness/harness.ts';
import {
  backgroundOf,
  budgetOf,
  checkOf,
  bareSkillOf,
  composedRefusal,
  ONE_BARE_NAME,
  sameBareIn,
  serversRefusal,
  contextOf,
  contextText,
  countOf,
  denialsOf,
  gateOf,
  harnessOf,
  outputOf,
  remoteOf,
  rulesOf,
  serverNamesOf,
  skillNamesOf,
  writableNamesOf,
  readsNamesOf,
  slotOf,
  toolsOf,
  wordOf,
  workspaceOf,
  placeNamed,
  placeRequired,
} from '../keys/index.ts';
import {
  codexModeWritten,
  codexSandboxNamed,
  FORMER_KEYS,
  formerKeyWritten,
  placeSpelled,
  placeWritten,
  readKeys,
  type Spelled,
} from '../former/former.ts';
import type { Agent, Agents, SkillsFound } from '../agents/agents.ts';
import { headedLayers } from './layers.ts';
import { tallyOf } from '../tally/tally.ts';
import { mergedOutput } from '../keys/index.ts';
import { addedSkillsRefusal, agentDeniesOf, deniesWith, fenceRefusal, ownDenies, refuseUnwritable } from './fence.ts';

/** A factory's `rules` as a step on `harness` is told them, trimmed: none for blank rules, and none on a remote agent. */
const rulesTold = (rules: string | undefined, harness: string | undefined): string | undefined =>
  isRemoteHarness(harness?.trim()) ? undefined : rules?.trim() || undefined;

/**
 * The words a step is told above its own note, each kept apart on the frozen step: its agent's instructions, the person's custom
 * instructions for the agent, and the factory's rules as `rulesTold` gives them. A layer that says nothing has no key.
 */
const wordsAbove = (agent: Agent, factoryRules: string | undefined) => ({
  ...(agent.body && { instructions: agent.body }),
  ...(agent.customInstructions && { customInstructions: agent.customInstructions }),
  ...(factoryRules && { factoryRules }),
});

/**
 * One step, from its file's text.
 *
 * `read` answers for a file beside the step — the folder's, relative to it — or `undefined` when there
 * is none. Only `output:` names one, and a step parsed without a folder cannot have it read.
 *
 * `agents` are the agents `agent:` may name (`loadAgents`). A step that names one is resolved here, once: each role key the agent sets is
 * the step's unless the step sets it too — the fence under either name, `permissionMode:` or `sandbox:`, as one key, so a step with a fence
 * of its own is given neither of its agent's; a fence key the step sets may only narrow its agent's (`fenceRefusal`), but for
 * `disallowedTools:`, which adds to its agent's: the session is refused the step's own rules, then each of the agent's they do not cover
 * (`deniesWith`, `StepAgent.agentDenies`). What the step is told is the agent's instructions, then a person's custom instructions for it
 * (`Agent.customInstructions`), then the step's own note, each under the heading of its layer's number and owner (`headedLayers`) — the
 * agent's alone when the step has none. Custom instructions are words and set no key. The step's own lines are read against the harness it
 * runs on, its agent's where it names none, before the two are merged: a step's `permissionMode:` on codex is its own `sandbox:`. A schema
 * the agent's `output:` names is read beside the agent, and one the step names beside the step; the step's output is both, merged
 * (`mergedOutput`), each field with one owner, and a field both declare is refused naming it and both declarers. Everything downstream of
 * the parser sees the resolved step; `agent` on it says what was the step's own.
 *
 * `hired` is the agent a factory hires into a step (`Hire`): a step whose file names no agent is resolved with it exactly as if its file
 * said `agent: <name>`. A step whose file names its own agent and is hired one too is refused, naming both (`attachedAgent`).
 *
 * `rules` are the rules of the factory the step is loaded in, told between the custom instructions and the step's own note and kept on
 * the step's agent (`StepAgent.factoryRules`): words too, which set no key. A step with no agent is not told them, nor one on a remote
 * agent, whose brief leaves the machine.
 *
 * A file that says no `place:` is refused before any line is judged against its agent (`placeRequired`): no agent gives a step its place.
 */
export function parseWorkflow(
  name: string,
  text: string,
  read?: (file: string) => string | undefined,
  agents?: Agents,
  skills?: SkillsFound,
  hired?: Hire,
  rules?: string,
): Workflow {
  const { block, body: own } = splitFrontmatter(name, text);
  let {
    meta: { agent: written, ...meta },
    spelled,
  } =
    block === null
      ? { meta: {} as Partial<Record<StepKey, string>>, spelled: {} }
      : readKeys<StepKey>(name, block, (key) => (isStepKey(key) ? undefined : unknownKey(name, key)));
  meta = placeSpelled(name, meta);
  placeRequired(name, meta.place);
  const attached = attachedAgent(name, written, hired);
  if (attached === undefined) {
    if (!own) throw new WorkflowError(`${name}: the body is empty — a step with nothing to say is not a step`);
    const step = stepFrom(name, codexSandboxNamed(name, meta, meta.harness), own, read, spelled);
    if (meta.skills !== undefined)
      refuse(
        `${name}: \`skills: ${meta.skills}\` adds skills to the step's agent, and this step has none. Name one — \`agent: <name>\` — whose skills these add to, or delete the line.`,
      );
    if (meta.mcp !== undefined) refuse(agentlessServers(name, meta.mcp));
    refuseUnwritable(step, undefined);
    return step;
  }
  const agent = agentOf(name, attached, agents, hired);
  meta = codexSandboxNamed(name, meta, meta.harness ?? agent.keys.harness);
  const inherited = fenceOf(meta) === undefined ? agent.keys : withoutFence(agent.keys);
  const factoryRules = rulesTold(rules, meta.harness ?? agent.keys.harness);
  const body = headedLayers([
    ['instructions', agent.body],
    ['custom', agent.customInstructions],
    ['factory', factoryRules],
    ['policy', own],
  ]);
  if (!body)
    throw new WorkflowError(
      `${name}: the body is empty, and so is ${AGENTS_FOLDER}/${agent.name}.md's — a step with nothing to say is not a step. Write what the agent is told in its file, or this step's own note below its frontmatter.`,
    );
  const output = mergedOutput(name, agent.name, outputOf(name, agent.keys.output, agent.read), outputOf(name, meta.output, read));
  const resolved = { ...inherited, ...meta };
  delete resolved.output;
  const { step, agentDenies } = withAgentDenies(stepFrom(name, resolved, body, read, spelled, output), meta, agent);
  agentStepRefusal(name, agent, meta, step, skills);
  refuseUnwritable(step, agent.name);
  const added = step.skills?.filter((skill) => !agent.skills?.includes(skill));
  const sessionSkills = [...(agent.skills ?? []), ...(added ?? [])];
  oneBareName(name, agent, sessionSkills);
  const keys = STEP_KEYS.filter((key) => Object.hasOwn(meta, key));
  const given = Object.fromEntries(
    STEP_KEYS.flatMap((key) => {
      const value = key === 'agent' || keys.includes(key) ? undefined : writtenValue(name, key, step[key]);
      return value === undefined ? [] : [[key, value]];
    }),
  );
  return {
    ...step,
    agent: {
      name: agent.name,
      keys,
      body: own,
      given,
      ...wordsAbove(agent, factoryRules),
      ...(sessionSkills.length && { skills: sessionSkills }),
      ...(added && { addedSkills: added }),
      ...(agentDenies && { agentDenies }),
      ...(agent.harnessPrompt !== undefined && { harnessPrompt: agent.harnessPrompt }),
      mcp: sessionServers(agent, step),
    },
  };
}

/**
 * Step `step`, read from its own lines `own` over its agent `agent`'s, with what its session is refused: where its own file writes a
 * `disallowedTools:` line and its agent denies anything, its own rules then each of the agent's they do not cover (`deniesWith`), and
 * the agent's apart, which the step's provenance keeps (`StepAgent.agentDenies`). Any other step as it was read, with none apart.
 */
function withAgentDenies(step: Workflow, own: Partial<Record<StepKey, string>>, agent: Agent): { step: Workflow; agentDenies?: string[] } {
  const agentDenies = own.disallowedTools === undefined ? [] : agentDeniesOf(agent);
  if (!agentDenies.length) return { step };
  return { step: { ...step, disallowedTools: deniesWith(step.disallowedTools ?? [], agentDenies) }, agentDenies };
}

/**
 * Refuses step `name` whose session would hold two skills of one bare name (`sameBareIn`) among `skills`, its agent `agent`'s then those
 * its own line adds: the refusal names the step, both skills and whose line each is on.
 */
function oneBareName(name: string, agent: Agent, skills: readonly string[]): void {
  const same = sameBareIn(skills);
  if (!same) return;
  const [first, second] = same.map(
    (skill) =>
      `\`${skill}\`, on ${agent.skills?.includes(skill) ? `${AGENTS_FOLDER}/${agent.name}.md's \`skills:\`` : "this step's `skills:`"}`,
  );
  refuse(
    `${name}: its session would be given ${first}, and ${second}: two skills named \`${bareSkillOf(same[1])}\`. ${ONE_BARE_NAME} Keep one of them here, and give the other to another step.`,
  );
}

/** The refusal of an `mcp:` line, written as `line`, on step `name`, which has no agent whose servers it would add to. */
const agentlessServers = (name: string, line: string): string =>
  `${name}: \`mcp: ${line}\` adds MCP servers to the step's agent's, and this step has none. Name one — \`agent: <name>\` — whose servers these add to, or delete the line.`;

/** The MCP servers a session of `step` loads: those its agent `agent` names, then those the step's own `mcp:` line adds, each once. */
const sessionServers = (agent: Agent, step: Workflow): string[] => [...new Set([...(agent.mcp ?? []), ...(step.mcp ?? [])])];

/**
 * Refuses step `name`, resolved as `step` from its own lines `own` and its agent `agent`: a fence key that would widen the agent's
 * (`fenceRefusal`), a composition the harness cannot take (`composedRefusal`, `serversRefusal`), and, given the places' `skills`, a
 * skill none of them has.
 * The servers are asked of the agent's line, then of the step's own (`mcp:`).
 * Each is asked of the agent's skills, then of those the step adds (`skills:`), the step's own fence for them asked by
 * `addedSkillsRefusal`: a skill the agent's fence cannot load.
 */
function agentStepRefusal(
  name: string,
  agent: Agent,
  own: Partial<Record<StepKey, string>>,
  step: Workflow,
  skills: SkillsFound | undefined,
): void {
  const loosened = fenceRefusal(name, agent, own, step);
  if (loosened !== undefined) refuse(loosened);
  const by = `${name}: \`agent: ${agent.name}\``;
  const composed =
    composedRefusal(by, agent.skills, agent.harnessPrompt, step) ??
    serversRefusal(by, agent.mcp, step) ??
    serversRefusal(name, step.mcp, step);
  if (composed !== undefined) refuse(composed);
  if (skills) for (const skill of agent.skills ?? []) skillAt(name, agent.name, skill, skills);
  if (own.skills === undefined || !step.skills) return;
  const unloadable = addedSkillsRefusal(name, agent, own.skills, step.skills, step);
  if (unloadable !== undefined) refuse(unloadable);
  const added = composedRefusal(name, step.skills, undefined, step);
  if (added !== undefined) refuse(added);
  const line = `${name}: \`skills: ${own.skills}\``;
  if (skills) for (const skill of step.skills) foundSkill(`${line} adds the skill \`${skill}\``, "this step's", skill, skills);
}

/** The folder of the skill `skill` that step `step`'s agent names, or why not: none of the places has it, or two of one repository do. */
export function skillAt(step: string, agent: string, skill: string, skills: SkillsFound): string {
  return foundSkill(`${step}: \`agent: ${agent}\` gives the skill \`${skill}\``, "the agent's", skill, skills);
}

/**
 * The folder of the skill `skill`, or why not, after `named`, which says who gives it: none of the places has it — and the fix takes it off
 * `whose` `skills:` line — or two of one repository do.
 */
function foundSkill(named: string, whose: string, skill: string, skills: SkillsFound): string {
  const found = skills.at.get(skill);
  if (found instanceof WorkflowError) refuse(`${named}, which cannot be used — ${found.message}`);
  if (found !== undefined) return found;
  return refuse(
    `${named}, and no skills folder has it — looked in ${skills.looked.join(', ')}. A skill is a folder holding a SKILL.md: write skills/${skill}/SKILL.md beside ${AGENTS_FOLDER}/, or take \`${skill}\` off ${whose} \`skills:\`.`,
  );
}

/** The fence a step's lines write, under either name: Claude Code's permission mode or Codex's sandbox. */
const fenceOf = (keys: Partial<Record<string, string>>): string | undefined => keys.sandbox ?? keys.permissionMode;

/** An agent's keys with neither fence, for a step that writes its own. */
function withoutFence<T extends Partial<Record<string, string>>>(keys: T): T {
  const { permissionMode: _mode, sandbox: _sandbox, ...rest } = keys;
  return rest as T;
}

/**
 * An agent a factory hires into a step (`nemia factory hire`): the agent's name, the factory's, and the step as the hire names it,
 * `<workflow>/<step>`.
 */
export type Hire = { agent: string; factory: string; step: string };

/** The agent a step is resolved with: its file's `agent:`, else the one a factory hires into it. Refused: both, naming each. */
function attachedAgent(step: string, written: string | undefined, hired: Hire | undefined): string | undefined {
  if (written !== undefined && hired !== undefined)
    refuse(
      `${step}: \`agent: ${written}\` fills this step in every factory, and the factory ${hired.factory} hires ${hired.agent} into it too. Take the hire back — nemia factory fire ${hired.factory} --step ${hired.step} — or delete the step's \`agent:\` line. Nothing was started.`,
    );
  return written ?? hired?.agent;
}

/**
 * The agent `agent:` names — or, for a step whose file names none, the one its factory hires (`hired`) — or why not: one there is not,
 * listing those there are, or one whose file is refused, in its words.
 */
function agentOf(step: string, name: string, agents: Agents | undefined, hired?: Hire): Agent {
  const found = agents?.get(name);
  const named = hired ? `the factory ${hired.factory} hires \`${name}\` into it, and its` : `\`agent: ${name}\` names an agent whose`;
  if (found instanceof WorkflowError) refuse(`${step}: ${named} file is refused — ${found.message}`);
  return found ?? refuse(notAnAgent(step, name, [...(agents?.keys() ?? [])].sort(), hired));
}

/** Why `name` is not an agent of `step`, among the agents `there` are: named by its `agent:` line, or by the factory that `hired` it. */
function notAnAgent(step: string, name: string, there: readonly string[], hired: Hire | undefined): string {
  const missing = hired ? `the factory ${hired.factory} hires \`${name}\` into it, which` : `\`agent: ${name}\``;
  const instead = hired ? `hire one — nemia factory hire ${hired.factory} <agent> --step ${hired.step}` : undefined;
  return (
    `${step}: ${missing} is not an agent here. ` +
    (there.length
      ? `The agents are: ${there.join(', ')} — ${instead ?? 'name one'}, or write ${AGENTS_FOLDER}/${name}.md beside them.`
      : `There are none: an agent is a file in ${AGENTS_FOLDER}/, beside the workflow's folder — write ${AGENTS_FOLDER}/${name}.md, or ${instead ?? 'delete the line'}.`)
  );
}

/**
 * A step from its keys as written and its body: each value read into the form the run uses, or refused in `name`'s words. `spelled` names a
 * key read under a former name (`FORMER_KEYS`) by that name, so a refusal quotes the line as the file has it. `resume: x` adds `x` to
 * `after`. `merged` is the output `parseWorkflow` resolved from a step and its agent, read in place of `meta.output`. Refused:
 * `model: inherit`, what Claude Code's `/agents` wizard writes for the parent's model, since a step's session has no parent.
 */
export function stepFrom(
  name: string,
  meta: Partial<Record<StepKey, string>>,
  body: string,
  read: ((file: string) => string | undefined) | undefined,
  spelled: Spelled = {},
  merged?: StepOutput,
): Workflow {
  const after = (meta.after ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (meta.resume && !after.includes(meta.resume)) after.push(meta.resume);
  const harness = harnessOf(name, meta.harness);
  if (harness !== undefined && isRemoteHarness(harness)) remoteRefusal(name, meta, harness);
  const background = backgroundOf(name, meta.background);
  const output = merged ?? outputOf(name, meta.output, read);
  if (meta.model?.trim() === 'inherit') {
    refuse(
      `${name}: \`model: inherit\` is Claude Code's word for a subagent that runs on the model of the conversation that called it, and a step's session is called by no conversation: it would be started as \`--model inherit\`. Delete the line for the harness's own default, or name a model: \`model: sonnet\`.`,
    );
  }
  autoRefusal(name, harness, meta.model, meta.permissionMode);

  return {
    name,
    after,
    resume: meta.resume,
    place: placeNamed(name, meta.place),
    workspace: workspaceOf(name, meta.workspace, meta.check, meta.resume, meta.retries, harness),
    writable: writableNamesOf(name, meta.writable),
    reads: readsNamesOf(name, meta.reads),
    slot: slotOf(name, meta.slot),
    body,
    skills: skillNamesOf(name, meta.skills),
    mcp: serverNamesOf(name, meta.mcp),
    harness,
    model: meta.model,
    effort: wordOf(name, 'effort', meta.effort, harness),
    context: contextOf(name, meta.context),
    permissionMode: wordOf(name, 'permissionMode', meta.permissionMode, harness),
    sandbox: wordOf(name, 'sandbox', meta.sandbox, harness),
    tools: toolsOf(name, meta.tools, harness),
    disallowedTools: rulesOf(name, 'disallowedTools', meta.disallowedTools, spelled.disallowedTools),
    allowedTools: rulesOf(name, 'allowedTools', meta.allowedTools, spelled.allowedTools),
    denials: denialsOf(name, meta.denials, harness, background),
    background,
    remote: remoteOf(name, meta.remote),
    deadlineSeconds: countOf(name, 'deadlineSeconds', meta.deadlineSeconds),
    budget: budgetOf(name, meta.budget),
    check: checkOf(name, meta.check),
    retries: countOf(name, 'retries', meta.retries),
    gate: gateOf(name, meta.gate),
    input: meta.input
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    output,
    tally: tallyOf(name, meta.tally, output),
    loop: loopOf(name, meta.loop, output),
    rounds: roundsOf(name, meta.loop, meta.rounds),
  };
}

/**
 * Refused: a Claude Code step that runs in `auto` — named, or the mode it is filed with when it names none — on a model that drops it
 * (`autoDropped`). The refusal names the modes that keep what the step is for.
 */
function autoRefusal(step: string, harness: string | undefined, model: string | undefined, permissionMode: string | undefined): void {
  const dropped = autoDropped(harness, model, permissionMode);
  if (!dropped) return;
  refuse(
    `${step}: \`model: ${model}\` ${dropped}. Name a mode the model keeps: \`permissionMode: acceptEdits\`, which writes in the step's directory unasked, or \`permissionMode: dontAsk\` with \`allowedTools:\` rules for what it may do — \`allowedTools: Edit(**), Bash(npm test)\`. Or run a model that keeps \`auto\`: sonnet, opus or fable.`,
  );
}

/**
 * Why a Claude Code session filed in `permissionMode` — the mode a step names, or `undefined` for none — would not run in it on `model`, as
 * the words after what names the model: `names no \`permissionMode:\`, …, and Claude Code drops \`auto\` …`. `undefined` when it would:
 * on a harness whose fence reach drops no word on that model (`fenceReach`): codex, which has sandboxes and not modes, a model that keeps
 * `auto`, or any mode but `auto`. Such a session says
 * `default` from its first turn, and a job denies every call `default` would ask about, which no line of the step says. The one wording
 * for the load's refusal (`autoRefusal`) and a retry's on another model (`retryRefusal`). Pure.
 */
export function autoDropped(
  harness: string | undefined,
  model: string | undefined,
  permissionMode: string | undefined,
): string | undefined {
  const reach = fenceReach(harness ?? DEFAULT_HARNESS, model);
  const mode = permissionMode ?? reach?.given;
  if (!reach || mode === undefined || !reach.dropped.includes(mode)) return undefined;
  const asked =
    permissionMode === undefined
      ? `names no \`permissionMode:\`, so it is filed in \`${mode}\`, the runtime's default`
      : `says \`permissionMode: ${mode}\``;
  return `${asked}, and Claude Code drops \`${mode}\` on that model: the session runs in \`default\`, and a job denies every call \`default\` would ask about`;
}

/**
 * A step as it is written back: what `renderStep` takes. A `Workflow` is one, and so is a step whose `output:` names its file without the
 * schema, which is read from beside the step when the file is parsed, never from here — and one whose `agent` is only the agent's name, a
 * step drafted with its own keys and note alone, which the parser resolves.
 */
export type StepDraft = Omit<Workflow, 'output' | 'agent'> & { output?: Pick<StepOutput, 'file'>; agent?: string | StepAgent | null };

/**
 * The keys whose empty list says what no line says: nothing to wait on, to read, to deny, to add. Not `tools:`, where none reads as every
 * tool to one person.
 */
const EMPTY_IS_UNSET: readonly StepKey[] = [
  'after',
  'input',
  'writable',
  'reads',
  'skills',
  'mcp',
  'disallowedTools',
  'allowedTools',
  'tally',
];

/**
 * A step as its file: the frontmatter, with the keys the step sets in `STEP_KEYS`' order, each written as the parser reads it — a list as
 * `a, b`, a count and a budget as the number, a context window in its one canonical form (`contextText`: `200k`, however it was written),
 * `output:` as the file it names — then the body. The inverse of `parseWorkflow`: a step it
 * read renders to a file it reads back as the same step, which `test/workflow.test.ts` holds over every shipped folder. Pure.
 *
 * Unset is `undefined` or `null`, and an empty list where no line says the same (`EMPTY_IS_UNSET`). `rounds:` is written where the step
 * has it, the default included, and `after:` lists the step `resume:` names too, as the parser read it. A file's comments are not on
 * the step, so a render has none.
 *
 * A step whose `agent` says where its keys came from (`StepAgent`, as the parser resolves one) is written as its file was: `agent:`, the
 * keys the step set itself and its own note — never what the agent gave it, which would pin the agent's words in every step's file. A key
 * it did not set but whose value was changed since it was read is written too, as the step's own: a change is never dropped. Its body is
 * its own note, whatever `body` says. Its `disallowedTools:` is written without the denies its agent gave it (`ownDenies`), since a step's
 * line adds to its agent's: one that only repeated them writes no line. A step whose `agent` is a name is a draft of the step's own:
 * every key it sets is written, after `agent:`, and its body is its own note.
 *
 * It judges nothing the parser judges: a value the parser would refuse is written as given, and the parser refuses it in its own words
 * (`writeWorkflow` parses what it rendered before it writes). Refused here is only what a file cannot hold, which the parser would never
 * see: a key no step has, in the parser's words, since it would be dropped; a line break in a value, which ends the line and makes what
 * follows a line of its own — a key, even; a comma inside a step's name in `after:` or `input:`, which would be read as two names; and
 * `workspace: folder`, the former spelling of `place: folder`, which the parser reads but nothing writes (`placeWritten`).
 *
 * A step with no key and a body that opens on `---` is written after a frontmatter of one blank line: with none before it, the body
 * would be read as the frontmatter, and after an empty one, as its block.
 */
export function renderStep(step: StepDraft): string {
  const unknown = Object.keys(step).find(
    (key) => key !== 'name' && key !== 'body' && !isStepKey(key) && (step as Record<string, unknown>)[key] != null,
  );
  if (unknown !== undefined)
    refuse(Object.hasOwn(FORMER_KEYS, unknown) ? formerKeyWritten(step.name, unknown) : unknownKey(step.name, unknown));
  if (step.harness === 'codex' && step.permissionMode != null) refuse(codexModeWritten(step.name, step.permissionMode));
  if ((step.workspace as string | undefined) === 'folder') refuse(placeWritten(step.name));
  const provenance = step.agent != null && typeof step.agent === 'object' ? step.agent : undefined;
  const lines = STEP_KEYS.flatMap((key) => {
    const value = writtenValue(step.name, key, key === 'agent' ? (provenance?.name ?? step.agent) : ownValue(step, key));
    if (provenance && key !== 'agent' && !provenance.keys.includes(key) && value === provenance.given?.[key]) return [];
    return value === undefined ? [] : [`${key}: ${value}`];
  });
  const body = String((provenance ? provenance.body : step.body) ?? '').trim();
  if (lines.length) return `---\n${lines.map((line) => `${line}\n`).join('')}---\n${body}\n`;
  return /^---[ \t]*(?:\n|$)/.test(body) ? `---\n\n---\n${body}\n` : `${body}\n`;
}

/** The value of `key` the step's own file holds: its own denies alone for `disallowedTools`, its agent's left to it (`ownDenies`). */
const ownValue = (step: StepDraft, key: StepKey): unknown =>
  key === 'disallowedTools' && step.disallowedTools != null ? ownDenies(step) : step[key];

/**
 * One key's value as its line writes it, or `undefined` for a key the step does not set. `output:` is written as the file it names, the
 * schema being the folder's; one naming no file is written with no value, which the parser refuses.
 */
function writtenValue(step: string, key: StepKey, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  let text: string;
  if (Array.isArray(value)) {
    if (!value.length && EMPTY_IS_UNSET.includes(key)) return undefined;
    const entries = value.map(String);
    const split = key === 'after' || key === 'input' ? entries.find((entry) => entry.includes(',')) : undefined;
    if (split !== undefined) {
      refuse(
        `${step}: \`${key}\` lists \`${split}\`, and a list is split on every comma, so it would be read as ${split
          .split(',')
          .map((s) => `\`${s.trim()}\``)
          .join(', ')}. A step's name has no comma: give each step an entry of its own.`,
      );
    }
    text = entries.join(', ');
  } else if (key === 'context' && typeof value === 'number') {
    text = contextText(value);
  } else if (key === 'output' && typeof value === 'object') {
    text = writtenValue(step, key, (value as { file?: unknown }).file) ?? '';
  } else if (typeof value === 'object' || typeof value === 'function') {
    refuse(
      `${step}: \`${key}\` is ${JSON.stringify(value) ?? `a ${typeof value}`}, and a frontmatter line holds a word, a number or a list: an object would be written as \`[object Object]\`.`,
    );
  } else {
    // oxlint-disable-next-line typescript/no-base-to-string -- the branches above took an object and a function
    text = String(value);
  }
  if (/[\r\n]/.test(text)) {
    refuse(
      `${step}: \`${key}\` holds a line break, and a frontmatter line is one key and its value: what follows the break would be read as a line of its own. Write it on one line${key === 'check' ? ' — commands joined with `&&`' : ''}.`,
    );
  }
  return text;
}

/**
 * `loop:` as written, refused unless the step can say whether to go round again: one step, and `again` declared
 * boolean in its `output:`. That the step it names comes before this one is the workflow's to say (`validate`).
 */
function loopOf(step: string, loop: string | undefined, output: StepOutput | undefined): string | undefined {
  if (loop === undefined) return undefined;
  if (loop.includes(',')) {
    refuse(
      `${step}: \`loop: ${loop}\` names more than one step. A loop runs one earlier step again, and every step between it and this one follows: name the first of them.`,
    );
  }
  const named = `${step}: \`loop: ${loop}\` runs ${loop} again when this step's closeout says \`again: true\``;
  const declare = 'Declare it — `"again": { "type": "boolean" }`, listed in `required` — so the run reads a yes or a no, never prose.';
  if (!output)
    refuse(`${named}, and this step declares no \`output:\`, so its closeout has no \`again\`. Give it an \`output:\` schema. ${declare}`);
  const again = output.schema.properties.again;
  if (!again) refuse(`${named}, and \`output: ${output.file}\` does not declare \`again\`. ${declare}`);
  if (again.type !== 'boolean') {
    refuse(
      `${named}, and \`output: ${output.file}\` declares \`again\` as ${JSON.stringify(again.type ?? again)}. It is \`"type": "boolean"\`: true or false, and nothing the run would have to interpret.`,
    );
  }
  return loop;
}

/** `rounds:`, which counts the rounds of a loop: refused on a step with no `loop:`, and `DEFAULT_ROUNDS` on one that does not say. */
function roundsOf(step: string, loop: string | undefined, rounds: string | undefined): number | undefined {
  if (rounds !== undefined && loop === undefined) {
    refuse(
      `${step}: \`rounds: ${rounds}\` counts the rounds of a loop, and this step has no \`loop:\`. Add \`loop: <step>\`, naming the earlier step to run again, or delete the line. To try one step again after its check refuses it, that is \`retries:\`.`,
    );
  }
  return loop === undefined ? undefined : (countOf(step, 'rounds', rounds) ?? DEFAULT_ROUNDS);
}

/**
 * The refusal of a key no step has, by name: with a reason of its own where it has one (`REFUSED`), and otherwise with the keys a step has.
 */
const unknownKey = (step: string, key: string): string =>
  Object.hasOwn(REFUSED, key)
    ? `${step}: a step may not set \`${key}\` — ${REFUSED[key]}.`
    : `${step}: \`${key}\` is not a key a step has. A step's keys are: ${STEP_KEYS.join(', ')}. Correct the spelling or delete the line — a key the run does not read is a constraint nobody enforces.`;
