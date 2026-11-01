/**
 * A checked template rendered into a factory's own folder, in today's format (`renderFactory`): the inverse of `nemia template export`'s
 * `draftOf`. Each workflow's steps become step files (`renderStep`), each agent an agent file (`renderAgent`) with its output schema
 * beside it, each skill's folder is carried as it is, and the manifest's hires, its revisions policy and the workflows become the
 * factory's wiring (`factory.json`), its instruction `NEMIA.md`, its rules `RULES.md`. The tree is laid out as yours is:
 * `workflows/<workflow>/`, `workflows/agents/` and `workflows/skills/`, so today's readers load it unchanged. Pure: the store reads the
 * folder and the files a document names, and writes what comes back. A key today's format has no place for is refused by name, never
 * dropped.
 */
import { renderAgent, type AgentDraft } from '../agents/agents.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { REVISIONS_POLICIES, type RevisionsPolicy } from '../factory/factory.ts';
import { FACTORY_RULES_FILE, factoryRulesRefusal } from '../rules/rules.ts';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { isMap, type ReadFolder } from '../template/index.ts';
import { renderStep } from '../workflow/index.ts';
import { baseSpelled } from '../former/former.ts';
import { substitute, type Params } from './params.ts';

/** A checked template as the store hands it in: its folder as read, and the text of one of its files by its path. */
export type TemplateRead = { folder: ReadFolder; text: (file: string) => string };

/**
 * The wiring a factory made from a template is given: every workflow it holds, by name, who fills each `<workflow>/<step>`, and whether
 * its runs follow merged revisions, where the manifest says (`spec.revisions`).
 */
export type Wiring = { workflows: string[]; hires: Record<string, string>; revisions?: RevisionsPolicy };

/**
 * A rendered factory: each file to write, by its path in the tree; each file of the template carried as it is (`from`) to `path`; its
 * wiring; and what refuses it, each by name — nothing is written while one stands.
 */
export type Rendered = {
  files: Array<{ path: string; text: string }>;
  copies: Array<{ path: string; from: string }>;
  wiring: Wiring;
  refusals: string[];
};

/** A document's spec, its `{param}` values given. */
type Spec = Record<string, unknown>;

/** The tree's folder of workflows, agents and skills, as yours lays them out. */
const WORKFLOWS = 'workflows';

/** The keys of a harness's block that today's format writes as they are. */
const BLOCK_WORDS = ['model', 'effort', 'context'] as const;

/** A value as a frontmatter line writes it: a list as `a, b`, anything else as its words. */
const lineOf = (value: unknown): string => (Array.isArray(value) ? value.map(String).join(', ') : String(value));

/** The text a `Text` value gives: the words, or the file of the template it names (`{path}`). */
function textOf(value: unknown, read: TemplateRead): string {
  if (isMap(value) && typeof value.path === 'string') return read.text(value.path);
  return String(value);
}

/** The words of `value` when present, else of `file` when the template holds it, else none. */
function textOr(value: unknown, file: string, read: TemplateRead): string | undefined {
  if (value !== undefined) return textOf(value, read);
  return read.folder.files.includes(file) ? read.text(file) : undefined;
}

/** The keys the block `block` of the harness `name` writes as today's lines name them, its `options` refused into `refusals`. */
function blockLines(where: string, name: string, block: Spec, refusals: string[]): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const key of BLOCK_WORDS) if (block[key] !== undefined) keys[key] = lineOf(block[key]);
  if (isMap(block.fence)) for (const [key, value] of Object.entries(block.fence)) keys[key] = lineOf(value);
  if (block.options !== undefined)
    refusals.push(
      `${where}: \`${name}.options\` is handed to ${name} as it is, and a factory's folder has no line for it yet. Remove it, and apply again.`,
    );
  return keys;
}

/**
 * The keys of the block `blocks[harness]` as today's lines name them: its model, effort and context, and each fence key under its own name
 * (`permissionMode`, `sandbox`, a tool list). Refused into `refusals`: `options`, which today's format has no line for, and a block of
 * another harness than the one it runs on, since today's folder holds the keys of one.
 */
function blockKeys(where: string, blocks: Spec, harness: string, refusals: string[]): Record<string, string> {
  let keys: Record<string, string> = {};
  for (const [name, block] of Object.entries(blocks)) {
    if (!isMap(block)) continue;
    if (name === harness) keys = blockLines(where, name, block, refusals);
    else
      refusals.push(
        `${where}: \`${name}:\` is a block for ${name}, and this runs on ${harness}: a factory's folder holds the keys of the harness it runs on alone. Remove the block, or run it on ${name}.`,
      );
  }
  return keys;
}

/** The blocks of a spec: every key but `known`, each a harness's. */
const blocksOf = (spec: Spec, known: readonly string[]): Spec =>
  Object.fromEntries(Object.entries(spec).filter(([key]) => !known.includes(key)));

/** The step keys copied from the template as a line writes them. */
const STEP_WORDS = [
  'after',
  'input',
  'place',
  'workspace',
  'budget',
  'check',
  'loop',
  'rounds',
  'retries',
  'deadlineSeconds',
  'reads',
  'tally',
];

/**
 * The step `step` of `workflow` as its file: its wiring, a former `workspace: main` written as `base` (`baseSpelled`), its overrides on
 * the harness it runs on (`harness`), and its instruction.
 */
function stepFile(workflow: string, step: Spec, harness: string, read: TemplateRead, refusals: string[]): string | undefined {
  const name = String(step.name);
  const where = `${WORKFLOWS}/${workflow}/workflow.yaml, step ${name}`;
  const keys: Record<string, string> = {};
  for (const key of STEP_WORDS) if (step[key] !== undefined) keys[key] = lineOf(step[key]);
  if (step.gate === true) keys.gate = 'true';
  Object.assign(keys, baseSpelled(keys));
  const overrides = isMap(step.overrides) ? step.overrides : {};
  if (typeof overrides.harness === 'string') keys.harness = overrides.harness;
  if (overrides.skills !== undefined) keys.skills = lineOf(overrides.skills);
  if (overrides.mcp !== undefined) keys.mcp = lineOf(overrides.mcp);
  Object.assign(keys, blockKeys(where, blocksOf(overrides, ['harness', 'skills', 'mcp']), harness, refusals));
  const body = textOr(step.instruction, `${WORKFLOWS}/${workflow}/${name}.md`, read) ?? '';
  try {
    return renderStep({ name, body, ...keys } as never);
  } catch (err) {
    refusals.push(`${where}: ${(err as Error).message}`);
    return undefined;
  }
}

/** The harness the agent `name` runs on, as its document says, or the default. */
function agentHarness(specs: ReadonlyMap<string, Spec>, name: string | undefined): string {
  const harness = name === undefined ? undefined : specs.get(name)?.harness;
  return typeof harness === 'string' ? harness : DEFAULT_HARNESS;
}

/** The workflow `name`'s step files and carried files, into `out`. */
function renderWorkflow(name: string, read: TemplateRead, specs: ReadonlyMap<string, Spec>, hires: Wiring['hires'], out: Rendered): void {
  const folder = `${WORKFLOWS}/${name}`;
  const spec = (read.folder.documents.get(`${folder}/workflow.yaml`) as { spec?: { steps?: Spec[] } } | null)?.spec;
  for (const step of spec?.steps ?? []) {
    const overrides = isMap(step.overrides) ? step.overrides : {};
    const harness = typeof overrides.harness === 'string' ? overrides.harness : agentHarness(specs, hires[`${name}/${String(step.name)}`]);
    const text = stepFile(name, step, harness, read, out.refusals);
    if (text !== undefined) out.files.push({ path: `${folder}/${String(step.name)}.md`, text });
  }
  for (const file of read.folder.files) {
    const rest = file.slice(folder.length + 1);
    if (!file.startsWith(`${folder}/`) || rest === 'workflow.yaml') continue;
    if (/^readme\.md$/i.test(rest) || !/\.(md|yaml)$/.test(rest)) out.copies.push({ path: file, from: file });
  }
}

/** The agent `name` as its file, and its output schema beside it, into `out`. */
function renderAgentOf(name: string, spec: Spec, read: TemplateRead, out: Rendered): void {
  const where = `agents/${name}/agent.yaml`;
  const harness = typeof spec.harness === 'string' ? spec.harness : DEFAULT_HARNESS;
  const keys: Record<string, string> = blockKeys(
    where,
    blocksOf(spec, ['role', 'description', 'instructions', 'skills', 'mcp', 'output', 'harness']),
    harness,
    out.refusals,
  );
  if (typeof spec.harness === 'string') keys.harness = spec.harness;
  const output = textOr(spec.output, `agents/${name}/output.schema.json`, read);
  if (output !== undefined) {
    keys.output = `${name}.schema.json`;
    out.files.push({ path: `${WORKFLOWS}/${AGENTS_FOLDER}/${name}.schema.json`, text: output });
  }
  const draft: AgentDraft = {
    name,
    role: String(spec.role),
    description: String(spec.description),
    skills: spec.skills === undefined ? null : lineOf(spec.skills),
    mcp: spec.mcp === undefined ? null : lineOf(spec.mcp),
    keys,
    body: textOr(spec.instructions, `agents/${name}/instructions.md`, read) ?? '',
  };
  try {
    out.files.push({ path: `${WORKFLOWS}/${AGENTS_FOLDER}/${name}.md`, text: renderAgent(draft) });
  } catch (err) {
    out.refusals.push(`${where}: ${(err as Error).message}`);
  }
}

/** The names of the folders of `holder` (`workflows`, `agents`) whose document `leaf` the template holds, sorted. */
const namesOf = (read: TemplateRead, holder: string, leaf: string): string[] =>
  read.folder.files
    .filter((file) => file.startsWith(`${holder}/`) && file.endsWith(`/${leaf}`) && file.split('/').length === 3)
    .map((file) => file.split('/')[1])
    .sort();

/** The spec of the document `file`, its `{param}` values given. */
const specAt = (read: TemplateRead, file: string, params: Params): Spec =>
  substitute((read.folder.documents.get(file) as { spec?: Spec } | null)?.spec ?? {}, params) as Spec;

/**
 * The factory's rules `rules`, where the template has any, into `RULES.md` of the tree. Refused by name, nothing to write: rules that
 * open with a frontmatter block (`factoryRulesRefusal`), since they only add words to what an agent is told.
 */
function renderRules(rules: string | undefined, out: Rendered): void {
  if (!rules?.trim()) return;
  const refused = factoryRulesRefusal(FACTORY_RULES_FILE, rules);
  if (refused) out.refusals.push(`${refused} Mend the template, and apply again.`);
  else out.files.push({ path: FACTORY_RULES_FILE, text: `${rules.trim()}\n` });
}

/**
 * The template `read`, which passes its check, rendered with `params` into the files of a factory's tree: each workflow's steps, each
 * agent, each skill carried whole (a `skill.yaml` left behind: what it fetches is refused by the check), `factory.json` holding every
 * workflow, the manifest's hires and its revisions policy, `NEMIA.md` from the manifest's instruction or the template's own, and
 * `RULES.md` from its rules, as `renderRules` writes them. Refused, each by name, nothing to write: what `renderStep`, `renderAgent` or
 * `renderRules` refuses, a harness block's `options`, and a block of a harness the step or agent does not run on.
 */
export function renderFactory(read: TemplateRead, params: Params): Rendered {
  const manifest = specAt(read, 'nemia.yaml', params);
  const hires = Object.fromEntries(Object.entries(isMap(manifest.hires) ? manifest.hires : {}).map(([k, v]) => [k, String(v)]));
  const workflows = namesOf(read, WORKFLOWS, 'workflow.yaml');
  const revisions = REVISIONS_POLICIES.find((p) => p === manifest.revisions);
  const wiring: Wiring = { workflows, hires, ...(revisions === undefined ? {} : { revisions }) };
  const out: Rendered = { files: [], copies: [], wiring, refusals: [] };
  const agents = new Map(namesOf(read, 'agents', 'agent.yaml').map((name) => [name, specAt(read, `agents/${name}/agent.yaml`, params)]));
  const substituted: TemplateRead = {
    text: read.text,
    folder: {
      ...read.folder,
      documents: new Map([...read.folder.documents].map(([file, doc]) => [file, substitute(doc, params)])),
    },
  };
  for (const workflow of workflows) renderWorkflow(workflow, substituted, agents, hires, out);
  for (const [name, spec] of agents) renderAgentOf(name, spec, read, out);
  for (const file of read.folder.files) {
    const [holder, , leaf] = file.split('/');
    if (holder === SKILLS_FOLDER && !(leaf === 'skill.yaml' && file.split('/').length === 3))
      out.copies.push({ path: `${WORKFLOWS}/${file}`, from: file });
  }
  const instruction = textOr(manifest.instruction, 'NEMIA.md', read);
  if (instruction !== undefined) out.files.push({ path: 'NEMIA.md', text: `${instruction.trim()}\n` });
  renderRules(textOr(manifest.rules, FACTORY_RULES_FILE, read), out);
  out.files.push({ path: 'factory.json', text: `${JSON.stringify(out.wiring, null, 2)}\n` });
  return out;
}
