/**
 * `nemia template export`'s mapping of today's folders onto a template (`draftOf`): each step's own lines, as its file writes them, onto a
 * workflow's step, its harness keys onto the block of the harness it runs on; each agent onto an agent's folder; each skill a step or an
 * agent names, carried whole; and a factory's hires, instruction and rules onto the manifest, NEMIA.md and RULES.md. Pure: the store
 * reads with the loader's own readers, hands the parts in, and writes what comes back. A key the template has no place for is refused by
 * name.
 */
import { HARNESS_KNOBS } from 'agent-runtime/vocabulary';
import type { Agent } from '../agents/agents.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';
import { budgetOf, countOf, gateOf, readsNamesOf, rulesOf, serverNamesOf, skillNamesOf, toolsOf } from '../keys/index.ts';
import { FACTORY_RULES_FILE } from '../rules/rules.ts';
import type { RevisionsPolicy } from '../factory/factory.ts';
import { API_VERSION, FENCE_KEYS, type Profile, type Step } from './layout.ts';

/** A step as its file writes it: its name, its own keys as the parser names them (never its agent's), its body and its file. */
export type StepSource = { name: string; keys: Readonly<Record<string, string>>; body: string; file: string };

/** A workflow of the repository: its folder, what its README says, its steps, and the other files of its folder, by path in it. */
export type WorkflowSource = {
  name: string;
  dir: string;
  description: string | null;
  steps: readonly StepSource[];
  others: readonly string[];
};

/** An agent found where the loader finds it: its file, as read, and its output schema's text where it names one. */
export type AgentSource = { name: string; file: string; agent: Agent; output: string | undefined };

/**
 * Where a skill named is: its folder, the folder of one named with its folder (`named`, which a template never carries), a place skill
 * nemia ships, or why it is not found (a refusal in the loader's words, or none).
 */
export type SkillFound = { dir: string } | { named: string } | 'place' | { refused: string } | undefined;

/**
 * A factory's parts the draft holds: its name, its file, its hires, and its instruction's words and its rules', each with the file they
 * were read from.
 */
export type FactorySource = {
  name: string;
  file: string;
  hires: Readonly<Record<string, string>>;
  instruction: { words: string; file: string } | undefined;
  rules: { words: string; file: string } | undefined;
  /** Whether its runs follow merged revisions, where it says: exported as the manifest's `spec.revisions`. */
  revisions?: RevisionsPolicy;
};

/** What `draftOf` reads: the template's name, the workflows, a factory's parts, and the loader's answer for an agent and a skill. */
export type Source = {
  template: string;
  workflows: readonly WorkflowSource[];
  factory: FactorySource | undefined;
  agent: (name: string) => AgentSource | { refused: string } | undefined;
  skill: (name: string) => SkillFound;
};

/**
 * A file of the draft: a document, a text, a file or folder copied from `copy` with its modes, or the skill folder `skill` carried as its
 * real files, a link it follows as what it points at.
 */
export type DraftFile = { path: string } & ({ document: unknown } | { text: string } | { copy: string } | { skill: string });

/** The draft: its files, where each part came from, and what refuses it, each by name; nothing is written while one stands. */
export type Draft = { files: DraftFile[]; from: Array<{ part: string; from: string }>; refusals: string[] };

/** The keys a step's or an agent's harness block holds, besides its fence. */
const BLOCK_KEYS = ['model', 'effort', 'context'] as const;

/** The step keys copied as they are, as strings. */
const WORDS = ['place', 'workspace', 'check', 'loop'] as const;

/** The step keys read as counts. */
const COUNTED = ['rounds', 'retries', 'deadlineSeconds'] as const;

/** The step keys the template places, besides the harness's: the rest are refused by name. */
const PLACED = new Set<string>([
  'agent',
  'skills',
  'mcp',
  'harness',
  'after',
  'input',
  'gate',
  'budget',
  'reads',
  'tally',
  ...WORDS,
  ...COUNTED,
  ...BLOCK_KEYS,
  ...FENCE_KEYS,
]);

/** A list as today's lines write one: comma-separated, each trimmed. */
const listOf = (written: string): string[] =>
  written
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** The fence key of `harness` that takes one word, which today's `permissionMode:` and `sandbox:` lines both name. */
const isWordKey = (key: string): boolean => Object.values(HARNESS_KNOBS).some((knobs) => knobs.fence.key === key);

/**
 * The block of `harness` that `keys`, a step's own or an agent's, write: its model, effort and context as written, and its fence, a word
 * under the harness's fence key and each tool list read as the loader reads it. Undefined where they write none.
 */
function blockOf(file: string, keys: Readonly<Record<string, string | undefined>>, harness: string): Profile | undefined {
  const fence: Record<string, string | readonly string[]> = {};
  for (const key of FENCE_KEYS) {
    const written = keys[key];
    if (written === undefined) continue;
    if (isWordKey(key)) fence[HARNESS_KNOBS[harness]?.fence.key ?? key] = written;
    else if (key === 'tools') fence[key] = toolsOf(file, written, harness) ?? [];
    else fence[key] = rulesOf(file, key as 'allowedTools' | 'disallowedTools', written) ?? [];
  }
  const block: Record<string, unknown> = {};
  for (const key of BLOCK_KEYS) if (keys[key] !== undefined) block[key] = keys[key];
  if (Object.keys(fence).length) block.fence = fence;
  return Object.keys(block).length ? block : undefined;
}

/** The step keys of `step` the template has no place for. */
const unplaced = (step: StepSource): string[] => Object.keys(step.keys).filter((key) => !PLACED.has(key));

/** The wiring of `step`, typed, in the template's order. */
function wiringOf(step: StepSource): Partial<Step> {
  const keys = step.keys;
  const wired: Record<string, unknown> = {};
  if (keys.after !== undefined) wired.after = listOf(keys.after);
  if (keys.input !== undefined) wired.input = listOf(keys.input);
  for (const key of WORDS.slice(0, 2)) if (keys[key] !== undefined) wired[key] = keys[key];
  if (gateOf(step.file, keys.gate)) wired.gate = true;
  if (keys.budget !== undefined) wired.budget = budgetOf(step.file, keys.budget);
  for (const key of WORDS.slice(2)) if (keys[key] !== undefined) wired[key] = keys[key];
  for (const key of COUNTED) if (keys[key] !== undefined) wired[key] = countOf(step.file, key, keys[key]);
  if (keys.reads !== undefined) wired.reads = readsNamesOf(step.file, keys.reads);
  if (keys.tally !== undefined) wired.tally = listOf(keys.tally);
  return wired;
}

/** `step` as the template writes it, the agent it is hired from (`hired`) giving the harness its block is for where it names none. */
function stepOf(step: StepSource, hired: AgentSource | undefined): Step {
  const harness = step.keys.harness ?? hired?.agent.keys.harness ?? DEFAULT_HARNESS;
  const overrides: Record<string, unknown> = {};
  if (step.keys.harness !== undefined) overrides.harness = step.keys.harness;
  if (step.keys.skills !== undefined) overrides.skills = skillNamesOf(step.file, step.keys.skills);
  if (step.keys.mcp !== undefined) overrides.mcp = serverNamesOf(step.file, step.keys.mcp);
  const block = blockOf(step.file, step.keys, harness);
  if (block) overrides[harness] = block;
  return { name: step.name, ...wiringOf(step), ...(Object.keys(overrides).length ? { overrides } : {}) };
}

/** The agent `found` as the template writes it: its spec and the files of its folder. */
function agentFiles(found: AgentSource): DraftFile[] {
  const { agent } = found;
  const harness = agent.keys.harness ?? DEFAULT_HARNESS;
  const block = isRemoteHarness(harness) ? undefined : blockOf(found.file, agent.keys, harness);
  const spec = {
    role: agent.role ?? agent.name,
    description: agent.description ?? agent.role ?? agent.name,
    ...(agent.skills?.length ? { skills: agent.skills } : {}),
    ...(agent.mcp?.length ? { mcp: agent.mcp } : {}),
    ...(agent.keys.harness !== undefined ? { harness: agent.keys.harness } : {}),
    ...(found.output !== undefined ? { output: { path: `agents/${agent.name}/output.schema.json` } } : {}),
    ...(block ? { [harness]: block } : {}),
  };
  const folder = `agents/${agent.name}`;
  return [
    { path: `${folder}/agent.yaml`, document: documentOf('Agent', agent.name, undefined, spec) },
    ...(agent.body ? [{ path: `${folder}/instructions.md`, text: `${agent.body}\n` }] : []),
    ...(found.output !== undefined ? [{ path: `${folder}/output.schema.json`, text: found.output }] : []),
  ];
}

/** What of the agent `found` the template has no place for: a harness prompt, a remote, or a key the loader reads no other way. */
function agentRefusals(found: AgentSource): string[] {
  const { agent } = found;
  const keys = Object.keys(agent.keys).filter((key) => key !== 'output' && key !== 'harness' && !PLACED.has(key));
  if (agent.harnessPrompt !== undefined) keys.push('harnessPrompt');
  return keys.map((key) => unplacedWords(found.file, key));
}

/** Why `key`, written in `file`, is refused: the template has no place for it. */
const unplacedWords = (file: string, key: string): string =>
  `${file}: \`${key}:\` has no place in a template, which holds a step's wiring, reads and tally, and its harness's block. Remove the line, and export again. Nothing was written.`;

/** A document of `kind` named `name`, with what a person reads of it and its `spec`. */
const documentOf = (kind: string, name: string, description: string | null | undefined, spec: unknown) => ({
  apiVersion: API_VERSION,
  kind,
  metadata: { name, ...(description ? { description } : {}) },
  spec,
});

/** Whether the workflow file `other` is carried: a README, or a file that is no .md or .yaml. */
const carried = (other: string): boolean => /^readme\.md$/i.test(other) || !/\.(md|yaml)$/.test(other);

/** What a draft gathers while it maps: its files, where each came from, the refusals, and the agents and skills to carry. */
type Gathered = Draft & { agents: Map<string, string>; skills: Map<string, string> };

/** The agent `step` is filled by: its own `agent:`, or the factory's hire; both refused, naming each. */
function filledBy(source: Source, workflow: string, step: StepSource, into: Gathered): string | undefined {
  const hired = source.factory?.hires[`${workflow}/${step.name}`];
  const own = step.keys.agent;
  if (own !== undefined && hired !== undefined)
    into.refusals.push(
      `${step.file}: \`agent: ${own}\` fills this step, and the factory ${source.factory?.name} hires ${hired} into it too. Take the hire back — nemia factory fire ${source.factory?.name} --step ${workflow}/${step.name} — or delete the step's \`agent:\` line. Nothing was written.`,
    );
  return own ?? hired;
}

/** The workflow `workflow` mapped into `into`: its document, its steps' files and its carried files, and who fills each step. */
function gatherWorkflow(source: Source, workflow: WorkflowSource, into: Gathered, hires: Record<string, string>): void {
  const folder = `workflows/${workflow.name}`;
  const steps = workflow.steps.flatMap((step): Step[] => {
    into.refusals.push(...unplaced(step).map((key) => unplacedWords(step.file, key)));
    const agent = filledBy(source, workflow.name, step, into);
    if (agent !== undefined) {
      const hire = `${workflow.name}/${step.name}`;
      hires[hire] = agent;
      into.agents.set(agent, step.file);
      const by = step.keys.agent === undefined ? `${source.factory?.file}, its hire` : `${step.file}, its agent: line`;
      into.from.push({ part: `nemia.yaml hires ${hire}: ${agent}`, from: by });
    }
    for (const skill of step.keys.skills === undefined ? [] : listOf(step.keys.skills)) into.skills.set(skill, step.file);
    if (step.body) into.files.push({ path: `${folder}/${step.name}.md`, text: `${step.body}\n` });
    const found = agent === undefined ? undefined : source.agent(agent);
    try {
      return [stepOf(step, found && 'agent' in found ? found : undefined)];
    } catch (err) {
      into.refusals.push((err as Error).message);
      return [];
    }
  });
  into.files.push({ path: `${folder}/workflow.yaml`, document: documentOf('Workflow', workflow.name, workflow.description, { steps }) });
  for (const other of workflow.others) {
    if (carried(other)) into.files.push({ path: `${folder}/${other}`, copy: `${workflow.dir}/${other}` });
    else
      into.refusals.push(
        `${workflow.dir}/${other} has no place in a template's workflow folder, which carries no other .md or .yaml: move it out.`,
      );
  }
  into.from.push({ part: `${folder}/`, from: workflow.dir });
}

/** The agents gathered, each mapped into `into` with the skills it names, or refused: none found, or the loader's refusal of it. */
function gatherAgents(source: Source, into: Gathered): void {
  for (const [name, by] of [...into.agents].sort(([a], [b]) => a.localeCompare(b))) {
    const found = source.agent(name);
    if (found === undefined || 'refused' in found) {
      into.refusals.push(
        found?.refused ?? `${by} is filled by ${name}, and no agent of that name is found: write it, or fill the step with one there is.`,
      );
      continue;
    }
    into.refusals.push(...agentRefusals(found));
    into.files.push(...agentFiles(found));
    into.from.push({ part: `agents/${name}/`, from: found.file });
    for (const skill of found.agent.skills ?? []) if (!into.skills.has(skill)) into.skills.set(skill, found.file);
  }
}

/**
 * The skills gathered, each carried whole, a place skill left out and said, one named with its folder left out and said too, with where
 * it was read, or refused: none found, or the loader's refusal of it.
 */
function gatherSkills(source: Source, into: Gathered): void {
  for (const [name, by] of [...into.skills].sort(([a], [b]) => a.localeCompare(b))) {
    const found = source.skill(name);
    if (found === 'place') into.from.push({ part: `skills/${name}/`, from: 'left out: a place skill nemia ships' });
    else if (found !== undefined && 'named' in found)
      into.from.push({ part: name, from: `left out: a skill of the repository's folder, named and not carried, read from ${found.named}` });
    else if (found === undefined || 'refused' in found)
      into.refusals.push(found?.refused ?? `${by} names the skill ${name}, and none is found: carry it, or remove the name.`);
    else {
      into.files.push({ path: `skills/${name}`, skill: found.dir });
      into.from.push({ part: `skills/${name}/`, from: found.dir });
    }
  }
}

/**
 * The draft of the template `source.template`: each workflow, the agents its steps are filled by, the skills those agents and steps name
 * (a place skill left out), and the manifest with every hire, a factory's and the steps' own, and the factory's revisions policy where it
 * says one; NEMIA.md from the factory's instruction,
 * and RULES.md from its rules.
 * Refused, each by name, nothing to write: a key the template has no place for, a step filled twice, an agent or a skill not found.
 */
export function draftOf(source: Source): Draft {
  const into: Gathered = { files: [], from: [], refusals: [], agents: new Map(), skills: new Map() };
  const hires: Record<string, string> = {};
  for (const workflow of source.workflows) gatherWorkflow(source, workflow, into, hires);
  gatherAgents(source, into);
  gatherSkills(source, into);
  const revisions = source.factory?.revisions;
  const manifest = documentOf('FactoryTemplate', source.template, undefined, {
    version: '0.1.0',
    hires,
    ...(revisions === undefined ? {} : { revisions }),
  });
  into.files.unshift({ path: 'nemia.yaml', document: manifest });
  into.from.unshift({ part: 'nemia.yaml', from: source.factory?.file ?? 'written here: version 0.1.0, named for its folder' });
  for (const [part, words] of [
    ['NEMIA.md', source.factory?.instruction],
    [FACTORY_RULES_FILE, source.factory?.rules],
  ] as const) {
    if (!words) continue;
    into.files.push({ path: part, text: `${words.words.trim()}\n` });
    into.from.push({ part, from: words.file });
  }
  return { files: into.files, from: into.from, refusals: into.refusals };
}
