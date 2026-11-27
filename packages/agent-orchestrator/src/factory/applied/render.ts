/**
 * A checked template rendered into a factory's own folder, in today's format (`renderFactory`): the inverse of `nemia template export`'s
 * `draftOf`. Each workflow's steps become step files (`renderStep`), a step's own closeout schema named beside it, each agent an agent
 * file (`renderAgent`) with its output schema beside it, its fence lists written whole with the lines their `{ path }` items name
 * (`withSharedLines`), each skill's folder and the template's `carried/` are carried as they are, and the manifest's hires, its revisions
 * policy and the workflows become the factory's wiring (`factory.json`), its instruction `NEMIA.md`, its rules `RULES.md`. The tree is
 * laid out as yours is: `workflows/<workflow>/`, `workflows/agents/` and `workflows/skills/`, so today's readers load it unchanged. Pure:
 * the store reads the folder and the files a document names, and writes what comes back. A key today's format has no place for is refused
 * by name, never dropped. A parameter's value reaches inside text: each `${{ parameters.<name> }}` is written with it in every string of a
 * document (`substitute`) and in every text the render writes — a step's and an agent's instructions, `NEMIA.md`, `RULES.md`
 * (`interpolated`) — while a carried file (a script, a skill's files, a schema) is copied byte for byte.
 */
import { renderAgent, type AgentDraft } from '../../agents/agents.ts';
import { DEFAULT_HARNESS } from '../../harness/harness.ts';
import { REVISIONS_POLICIES, type RevisionsPolicy } from '../factory.ts';
import { FACTORY_RULES_FILE, factoryRulesRefusal } from '../rules/rules.ts';
import { frontmatterOfValues, frontmatterValues } from '../../frontmatter/frontmatter.ts';
import { AGENTS_FOLDER, CARRIED_FOLDER, FRONTMATTER, HOME_FOLDER, SKILLS_FOLDER, type RouteEval } from '../../step/step.ts';
import { isMap, listItemsOf, withSharedLines, type ReadFolder } from '../../template/index.ts';
import { renderStep } from '../../workflow/index.ts';
import { baseSpelled } from '../../former/former.ts';
import { interpolated, substitute, type Params } from './params.ts';
import { checkFailurePolicyOf, checksOf } from '../../check/index.ts';
import { selectorsRefusal } from '../../watch/selector.ts';
import { labelValuesOf } from '../../label-spelling/label-spelling.ts';

/**
 * A checked template as the store hands it in: its folder as read, the text of one of its files by its path, and the lines of a file of
 * shared lines (`sharedLinesOf`), undefined where it is no list of strings.
 */
export type TemplateRead = {
  folder: ReadFolder;
  text: (file: string) => string;
  lines: (file: string) => readonly string[] | undefined;
};

/**
 * The wiring a factory made from a template is given: every workflow it holds, by name, who fills each `<workflow>/<step>`, and whether
 * its runs follow merged revisions, where the manifest says (`spec.revisions`), and the values each label key it names takes, where the
 * manifest's `spec.labelValues` renders any (`renderedLabelValues`), the globs of its radius (`renderedSettings`) and the workflow its
 * first card runs in, where the manifest names them.
 */
export type Wiring = {
  workflows: string[];
  hires: Record<string, string>;
  revisions?: RevisionsPolicy;
  triggers?: Record<string, { selector: string; target: { kind: 'Workflow'; name: string }; since: string }>;
  labelValues?: Readonly<Record<string, readonly string[]>>;
  programs?: Record<string, { run: string; writes: string[] }>;
  radius?: { agentFacing: string[]; checkAffecting: string[]; lessons: string[] };
  firstWorkflow?: string;
};

/**
 * The card triggers of a template's manifest as a tree's wiring holds them, its parameters rendered: each whose selector renders
 * non-empty, its target's workflow by name; none where none is left. A selector that renders to one no card's labels can be read by
 * (`selectorsRefusal`) is refused by its trigger's name and the parameters it reads, never kept to queue nothing.
 * @param triggers The manifest's `triggers`, as its YAML reads, parameters substituted.
 * @param written The manifest's `triggers` as the template writes them, whose selectors name the parameters they read.
 */
function renderedTriggers(triggers: unknown, written: unknown) {
  const out: NonNullable<Wiring['triggers']> = {};
  const refused: string[] = [];
  for (const [name, t] of Object.entries(isMap(triggers) ? triggers : {})) {
    if (!isMap(t) || !isMap(t.target)) continue;
    const selector = typeof t.selector === 'string' ? t.selector.trim() : '';
    if (!selector) continue;
    const unread = selectorsRefusal([selector]);
    if (unread !== undefined) {
      refused.push(unreadTriggerRefusal(name, selector, unread, isMap(written) ? written[name] : undefined));
      continue;
    }
    out[name] = { selector, target: { kind: 'Workflow', name: String(t.target.name) }, since: '' };
  }
  return { wiring: Object.keys(out).length ? { triggers: out } : {}, refused };
}

/**
 * The programs a template carries (`programs/<name>/program.yaml`) as a tree's wiring holds them, their parameters rendered: each by its
 * folder's name, its `run:` line and the conditions it writes. A program whose `run:` renders empty is refused by name, never kept to run
 * nothing.
 * @param read The template as read, its documents' parameters substituted.
 * @param names The programs' names.
 */
function renderedPrograms(read: TemplateRead, names: readonly string[]) {
  const out: NonNullable<Wiring['programs']> = {};
  const refused: string[] = [];
  for (const name of names) {
    const file = `programs/${name}/program.yaml`;
    const spec = (read.folder.documents.get(file) as { spec?: Spec } | null)?.spec ?? {};
    const run = typeof spec.run === 'string' ? spec.run.trim() : '';
    if (!run) {
      refused.push(
        `${file}: the program ${name}'s run, as rendered, is empty: set the parameter it reads, or write a command, and apply again.`,
      );
      continue;
    }
    out[name] = { run, writes: Array.isArray(spec.writes) ? spec.writes.map(String) : [] };
  }
  return { wiring: Object.keys(out).length ? { programs: out } : {}, refused };
}

/** Why a template's trigger `name` is refused: its selector renders as `selector`, which no card's labels are read by. */
function unreadTriggerRefusal(name: string, selector: string, unread: string, written: unknown) {
  const raw = isMap(written) && typeof written.selector === 'string' ? written.selector : '';
  const named = [...raw.matchAll(/\$\{\{\s*parameters\.([\w-]+)\s*\}\}/g)].map((m) => m[1]);
  const fix = named.length
    ? `set ${named.map((p) => `--set ${p}=<value>`).join(' and ')} to what makes it a selector, as the parameter's description says`
    : "mend the trigger's selector in nemia.yaml";
  return `nemia.yaml: trigger ${name}'s selector, as rendered, is refused: ${unread}. It would queue no card: ${fix}, and apply again.`;
}

/**
 * The settings of a template's manifest the wiring carries beside its hires, parameters rendered: the globs of `spec.radius`, each list
 * split on whitespace with the empty words dropped, none where the manifest names no radius, and the workflow of `spec.firstWorkflow`.
 * @param manifest The manifest's spec, parameters substituted.
 */
function renderedSettings(manifest: Spec) {
  const { radius, firstWorkflow } = manifest;
  const globs = (key: string) => {
    const written = isMap(radius) ? radius[key] : undefined;
    return typeof written === 'string' ? written.split(/\s+/).filter((glob) => glob !== '') : [];
  };
  return {
    ...(isMap(radius)
      ? { radius: { agentFacing: globs('agentFacing'), checkAffecting: globs('checkAffecting'), lessons: globs('lessons') } }
      : {}),
    ...(typeof firstWorkflow === 'string' && firstWorkflow !== '' ? { firstWorkflow } : {}),
  } satisfies Pick<Wiring, 'radius' | 'firstWorkflow'>;
}

/**
 * The values each label key takes that a template's manifest states, its parameters rendered (`labelValuesOf`): none where it renders
 * empty. A word that renders as no label is refused naming the parameters the manifest's text reads, never dropped.
 * @param labelValues The manifest's `labelValues`, parameters substituted.
 * @param written The manifest's `labelValues` as the template writes it, which names the parameters it reads.
 */
function renderedLabelValues(labelValues: unknown, written: unknown) {
  const parsed = labelValuesOf(typeof labelValues === 'string' ? labelValues : '');
  if ('refused' in parsed) {
    const raw = typeof written === 'string' ? written : '';
    const named = [...raw.matchAll(/\$\{\{\s*parameters\.([\w-]+)\s*\}\}/g)].map((m) => m[1]);
    const fix = named.length
      ? `set ${named.map((p) => `--set ${p}=<value>`).join(' and ')} to key=value words apart by spaces, as the parameter's description says`
      : 'mend spec.labelValues in nemia.yaml to key=value words apart by spaces';
    const out: { wiring: Pick<Wiring, 'labelValues'>; refused: string[] } = {
      wiring: {},
      refused: [`nemia.yaml: labelValues, as rendered, is refused: ${parsed.refused}. ${fix}, and apply again.`],
    };
    return out;
  }
  const out: { wiring: Pick<Wiring, 'labelValues'>; refused: string[] } = {
    wiring: Object.keys(parsed.values).length ? { labelValues: parsed.values } : {},
    refused: [],
  };
  return out;
}

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
const lineOf = (value: unknown) => (Array.isArray(value) ? value.map(String).join(', ') : String(value));

/**
 * The text a `Text` value gives, each `${{ parameters.<name> }}` in it written with its value: the words, already written as a document's
 * string is (`substitute`), or the file of the template it names (`{path}`).
 */
function textOf(value: unknown, read: TemplateRead, params: Params) {
  if (isMap(value) && typeof value.path === 'string') return interpolated(read.text(value.path), params);
  return String(value);
}

/** The words of `value` when present, else of `file` when the template holds it, else none; each expression written with its value. */
function textOr(value: unknown, file: string, read: TemplateRead, params: Params) {
  if (value !== undefined) return textOf(value, read, params);
  return read.folder.files.includes(file) ? interpolated(read.text(file), params) : undefined;
}

/** The bytes of `value`'s file (`{path}`), else of `file` when the template holds it, else none: a schema, carried as it is. */
function carriedOr(value: unknown, file: string, read: TemplateRead) {
  if (isMap(value) && typeof value.path === 'string') return read.text(value.path);
  if (value !== undefined) return typeof value === 'string' ? value : JSON.stringify(value);
  return read.folder.files.includes(file) ? read.text(file) : undefined;
}

/**
 * A fence key's value as its line writes it: a tool list whole, each `{ path }` item in it replaced by the lines of the template's file it
 * names (`withSharedLines`), so the factory's tree holds the full list; a word as it is. A file that is no list of strings, which the
 * lint refuses before a render, gives none.
 */
function fenceLine(value: unknown, read: TemplateRead) {
  if (!Array.isArray(value)) return lineOf(value);
  const items = listItemsOf(value);
  const linesOf = Object.fromEntries(items.flatMap((item) => ('path' in item ? [[item.path, read.lines(item.path) ?? []]] : [])));
  return lineOf(withSharedLines(items, linesOf));
}

/** The keys the block `block` of the harness `name` writes as today's lines name them, its `options` refused into `refusals`. */
function blockLines(where: string, name: string, block: Spec, read: TemplateRead, refusals: string[]) {
  const keys: Record<string, string> = {};
  for (const key of BLOCK_WORDS) if (block[key] !== undefined) keys[key] = lineOf(block[key]);
  if (isMap(block.fence)) for (const [key, value] of Object.entries(block.fence)) keys[key] = fenceLine(value, read);
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
function blockKeys(where: string, blocks: Spec, harness: string, read: TemplateRead, refusals: string[]) {
  let keys: Record<string, string> = {};
  for (const [name, block] of Object.entries(blocks)) {
    if (!isMap(block)) continue;
    if (name === harness) keys = blockLines(where, name, block, read, refusals);
    else
      refusals.push(
        `${where}: \`${name}:\` is a block for ${name}, and this runs on ${harness}: a factory's folder holds the keys of the harness it runs on alone. Remove the block, or run it on ${name}.`,
      );
  }
  return keys;
}

/** The blocks of a spec: every key but `known`, each a harness's. */
const blocksOf = (spec: Spec, known: readonly string[]) => Object.fromEntries(Object.entries(spec).filter(([key]) => !known.includes(key)));

/** The step keys copied from the template as a line writes them. */
const STEP_WORDS = [
  'after',
  'input',
  'place',
  'workspace',
  'budget',
  'check',
  'run',
  'checkMemory',
  'loop',
  'rounds',
  'routes',
  'ends',
  'when',
  'workflow',
  'card',
  'relabel',
  'waitsFor',
  'retries',
  'deadlineSeconds',
  'memory',
  'memoryRequest',
  'reads',
  'tally',
];

/** A template's `route:` as the parser's `RouteEval`, which the step's file writes as YAML flow; undefined for none. */
function routeEvalOf(route: unknown) {
  if (route === 'judge') return { kind: 'judge' } satisfies RouteEval | undefined;
  if (!isMap(route)) return undefined;
  if (typeof route.script === 'string') return { kind: 'script', script: route.script } satisfies RouteEval | undefined;
  if (typeof route.from === 'string' && isMap(route.table))
    return {
      kind: 'table',
      from: route.from,
      table: Object.fromEntries(Object.entries(route.table).map(([k, v]) => [k, String(v)])),
    } satisfies RouteEval | undefined;
  return undefined;
}

/**
 * Whether `key` is a step's `checkMemory:`, `memoryRequest:`, `relabel:` or `mcp:` that renders blank, as an empty parameter writes it:
 * no line, so the check or the sessions ask the daemon's default request, the node edits no label and the step adds no server to its
 * agent's. A blank `checkMemory:`, `memoryRequest:` or `mcp:` in a person's step file is still refused by the parser.
 */
const blankAsked = (key: string, value: unknown) =>
  (key === 'checkMemory' || key === 'memoryRequest' || key === 'relabel' || key === 'mcp') &&
  lineOf(value).replaceAll(',', '').trim() === '';

/** A step's `mcp:` override as its line, none where it says none or renders blank (`blankAsked`). */
const mcpLineOf = (mcp: unknown) => (mcp === undefined || blankAsked('mcp', mcp) ? {} : { mcp: lineOf(mcp) });

/** A template's `checkFailurePolicy:` as the parser reads it, refused as a step's line would be; nothing for none. */
const policyOf = (step: string, policy: unknown) =>
  policy === undefined ? {} : { checkFailurePolicy: checkFailurePolicyOf(step, JSON.stringify(policy)) };

/** A template's `checks:` as the parser reads them, refused as a step's lines would be (`checksOf`); nothing for none. */
const checksOfTemplate = (step: string, checks: unknown) =>
  checks === undefined ? {} : { checks: checksOf(step, undefined, JSON.stringify(checks)) };

/**
 * The step `step` of `workflow` as its file: its wiring, a former `workspace: main` written as `base` (`baseSpelled`), its overrides on
 * the harness it runs on (`harness`), and its instruction.
 */
function stepFile(workflow: string, step: Spec, harness: string, read: TemplateRead, params: Params, refusals: string[]) {
  const name = String(step.name);
  const where = `${WORKFLOWS}/${workflow}/workflow.yaml, step ${name}`;
  const keys: Record<string, string> = {};
  for (const key of STEP_WORDS) if (step[key] !== undefined && !blankAsked(key, step[key])) keys[key] = lineOf(step[key]);
  if (step.gate === true) keys.gate = 'true';
  Object.assign(keys, baseSpelled(keys));
  const output = isMap(step.output) ? step.output.path : undefined;
  const folder = `${WORKFLOWS}/${workflow}/`;
  if (typeof output === 'string' && output.startsWith(folder)) keys.output = output.slice(folder.length);
  else if (output !== undefined)
    refusals.push(
      `${where}: \`output.path\` is ${JSON.stringify(output)}, no file of ${folder}: carry the schema there, name it from the template's root, and apply again.`,
    );
  const overrides = isMap(step.overrides) ? step.overrides : {};
  if (typeof overrides.harness === 'string') keys.harness = overrides.harness;
  if (overrides.skills !== undefined) keys.skills = lineOf(overrides.skills);
  Object.assign(keys, mcpLineOf(overrides.mcp));
  Object.assign(keys, blockKeys(where, blocksOf(overrides, ['harness', 'skills', 'mcp']), harness, read, refusals));
  const body = textOr(step.instruction, `${WORKFLOWS}/${workflow}/${name}.md`, read, params) ?? '';
  const route = routeEvalOf(step.route);
  try {
    return renderStep({
      name,
      body,
      ...keys,
      ...(route ? { route } : {}),
      ...policyOf(name, step.checkFailurePolicy),
      ...checksOfTemplate(name, step.checks),
    } as never);
  } catch (err) {
    refusals.push(`${where}: ${(err as Error).message}`);
    return undefined;
  }
}

/** The harness the agent `name` runs on, as its document says, or the default. */
function agentHarness(specs: ReadonlyMap<string, Spec>, name: string | undefined) {
  const harness = name === undefined ? undefined : specs.get(name)?.harness;
  return typeof harness === 'string' ? harness : DEFAULT_HARNESS;
}

/**
 * The workflow `name`'s step files and carried files, into `out`, and its machine needs (`spec.needs`) as its README's frontmatter
 * (`readmeWithNeeds`), since `workflow.yaml` is not carried into a factory.
 */
function renderWorkflow(
  name: string,
  read: TemplateRead,
  params: Params,
  specs: ReadonlyMap<string, Spec>,
  hires: Wiring['hires'],
  out: Rendered,
) {
  const folder = `${WORKFLOWS}/${name}`;
  const spec = (read.folder.documents.get(`${folder}/workflow.yaml`) as { spec?: { steps?: Spec[] } } | null)?.spec;
  for (const step of spec?.steps ?? []) {
    const overrides = isMap(step.overrides) ? step.overrides : {};
    const harness = typeof overrides.harness === 'string' ? overrides.harness : agentHarness(specs, hires[`${name}/${String(step.name)}`]);
    const text = stepFile(name, step, harness, read, params, out.refusals);
    if (text !== undefined) out.files.push({ path: `${folder}/${String(step.name)}.md`, text });
  }
  const needs = (spec as { needs?: unknown } | undefined)?.needs;
  const declares = Array.isArray(needs) && needs.length > 0;
  carryWorkflowFiles(folder, read, declares, out);
  if (declares) out.files.push({ path: `${folder}/README.md`, text: readmeWithNeeds(folder, needs, read) });
}

/**
 * The files of the workflow at `folder` a render carries as they are, into `out`: every file that is no .md or .yaml, and its README
 * unless its needs are written into one (`declares`).
 */
function carryWorkflowFiles(folder: string, read: TemplateRead, declares: boolean, out: Rendered) {
  for (const file of read.folder.files) {
    const rest = file.slice(folder.length + 1);
    if (!file.startsWith(`${folder}/`) || rest === 'workflow.yaml') continue;
    const readme = /^readme\.md$/i.test(rest);
    if (readme ? !declares : !/\.(md|yaml)$/.test(rest)) out.copies.push({ path: file, from: file });
  }
}

/**
 * The README of the workflow at `folder` with `needs` (its `spec.needs`, each `${{ parameters.<name> }}` already written with its value)
 * as its frontmatter (`needs:`), which `workflowNeeds` reads back: the template's own README below it, its own frontmatter's other keys
 * kept and its `needs` replaced, or only the frontmatter where the template has none.
 */
function readmeWithNeeds(folder: string, needs: readonly unknown[], read: TemplateRead) {
  const own = read.folder.files.find((file) => file.startsWith(`${folder}/`) && /^readme\.md$/i.test(file.slice(folder.length + 1)));
  const text =
    own === undefined
      ? ''
      : read
          .text(own)
          .replace(/^\uFEFF/, '')
          .replace(/\r\n/g, '\n');
  const block = FRONTMATTER.exec(text);
  const kept: unknown = block?.[1] === undefined ? {} : frontmatterValues(block[1]);
  const keys = isMap(kept) ? kept : {};
  const body = block ? text.slice(block[0].length) : text;
  return `---\n${frontmatterOfValues({ ...keys, needs })}---\n${body}`;
}

/** The agent `name` as its file, and its output schema beside it, into `out`. */
function renderAgentOf(name: string, spec: Spec, read: TemplateRead, params: Params, out: Rendered) {
  const where = `agents/${name}/agent.yaml`;
  const harness = typeof spec.harness === 'string' ? spec.harness : DEFAULT_HARNESS;
  const keys: Record<string, string> = blockKeys(
    where,
    blocksOf(spec, ['role', 'description', 'instructions', 'skills', 'mcp', 'overridable', 'output', 'harness']),
    harness,
    read,
    out.refusals,
  );
  if (typeof spec.harness === 'string') keys.harness = spec.harness;
  const output = carriedOr(spec.output, `agents/${name}/output.schema.json`, read);
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
    overridable: spec.overridable === undefined ? null : lineOf(spec.overridable),
    keys,
    body: textOr(spec.instructions, `agents/${name}/instructions.md`, read, params) ?? '',
  };
  try {
    out.files.push({ path: `${WORKFLOWS}/${AGENTS_FOLDER}/${name}.md`, text: renderAgent(draft) });
  } catch (err) {
    out.refusals.push(`${where}: ${(err as Error).message}`);
  }
}

/** The names of the folders of `holder` (`workflows`, `agents`) whose document `leaf` the template holds, sorted. */
const namesOf = (read: TemplateRead, holder: string, leaf: string) =>
  read.folder.files
    .filter((file) => file.startsWith(`${holder}/`) && file.endsWith(`/${leaf}`) && file.split('/').length === 3)
    .flatMap((file) => {
      const [, name] = file.split('/');
      return name === undefined ? [] : [name];
    })
    .sort();

/** The spec of the document `file`, its `{param}` values given. */
const specAt = (read: TemplateRead, file: string, params: Params) =>
  substitute((read.folder.documents.get(file) as { spec?: Spec } | null)?.spec ?? {}, params) as Spec;

/**
 * The factory's rules `rules`, where the template has any, into `RULES.md` of the tree. Refused by name, nothing to write: rules that
 * open with a frontmatter block (`factoryRulesRefusal`), since they only add words to what an agent is told.
 */
function renderRules(rules: string | undefined, out: Rendered) {
  if (!rules?.trim()) return;
  const refused = factoryRulesRefusal(FACTORY_RULES_FILE, rules);
  if (refused) out.refusals.push(`${refused} Mend the template, and apply again.`);
  else out.files.push({ path: FACTORY_RULES_FILE, text: `${rules.trim()}\n` });
}

/**
 * The template `read`, which passes its check, rendered with `params` into the files of a factory's tree: each workflow's steps, each
 * agent, each skill carried whole (a `skill.yaml` left behind: what it fetches is refused by the check), `factory.json` holding every
 * workflow, the manifest's hires, its revisions policy, its card triggers whose selector renders non-empty, its label values and its
 * programs, the
 * template's `home/` carried whole into the tree's `home/` (`HOME_FOLDER`), `NEMIA.md` from the manifest's instruction or the template's
 * own, and `RULES.md` from its rules, as `renderRules` writes them. Refused, each by name, nothing to write: what `renderStep`,
 * `renderAgent` or `renderRules` refuses, a harness block's `options`, and a block of a harness the step or agent does not run on.
 * @param read The template as read, which passes its check.
 * @param params The parameters' values to render with, by name.
 */
export function renderFactory(read: TemplateRead, params: Params) {
  const manifest = specAt(read, 'nemia.yaml', params);
  const hires = Object.fromEntries(Object.entries(isMap(manifest.hires) ? manifest.hires : {}).map(([k, v]) => [k, String(v)]));
  const workflows = namesOf(read, WORKFLOWS, 'workflow.yaml');
  const revisions = REVISIONS_POLICIES.find((p) => p === manifest.revisions);
  const writtenSpec = (read.folder.documents.get('nemia.yaml') as { spec?: Spec } | null)?.spec;
  const triggers = renderedTriggers(manifest.triggers, writtenSpec?.triggers);
  const labelValues = renderedLabelValues(manifest.labelValues, writtenSpec?.labelValues);
  const wiring: Wiring = {
    workflows,
    hires,
    ...(revisions === undefined ? {} : { revisions }),
    ...triggers.wiring,
    ...labelValues.wiring,
    ...renderedSettings(manifest),
  };
  const out: Rendered = { files: [], copies: [], wiring, refusals: [...triggers.refused, ...labelValues.refused] };
  const agents = new Map(namesOf(read, 'agents', 'agent.yaml').map((name) => [name, specAt(read, `agents/${name}/agent.yaml`, params)]));
  const substituted: TemplateRead = {
    text: read.text,
    lines: read.lines,
    folder: {
      ...read.folder,
      documents: new Map([...read.folder.documents].map(([file, doc]) => [file, substitute(doc, params)])),
    },
  };
  const programs = renderedPrograms(substituted, namesOf(read, 'programs', 'program.yaml'));
  Object.assign(out.wiring, programs.wiring);
  out.refusals.push(...programs.refused);
  if (workflows.includes(CARRIED_FOLDER))
    out.refusals.push(
      `${WORKFLOWS}/${CARRIED_FOLDER}/workflow.yaml: ${CARRIED_FOLDER}/ beside the workflows is the folder of carried files, the template's own ${CARRIED_FOLDER}/ rendered, and no workflow has its name. Rename the workflow's folder, and apply again.`,
    );
  for (const workflow of workflows) renderWorkflow(workflow, substituted, params, agents, hires, out);
  for (const [name, spec] of agents) renderAgentOf(name, spec, read, params, out);
  for (const file of read.folder.files) {
    const [holder, , leaf] = file.split('/');
    if (holder === SKILLS_FOLDER && !(leaf === 'skill.yaml' && file.split('/').length === 3))
      out.copies.push({ path: `${WORKFLOWS}/${file}`, from: file });
    if (holder === CARRIED_FOLDER) out.copies.push({ path: `${WORKFLOWS}/${file}`, from: file });
    if (holder === HOME_FOLDER) out.copies.push({ path: file, from: file });
  }
  const instruction = textOr(manifest.instruction, 'NEMIA.md', read, params);
  if (instruction !== undefined) out.files.push({ path: 'NEMIA.md', text: `${instruction.trim()}\n` });
  renderRules(textOr(manifest.rules, FACTORY_RULES_FILE, read, params), out);
  out.files.push({ path: 'factory.json', text: `${JSON.stringify(out.wiring, null, 2)}\n` });
  return out;
}
