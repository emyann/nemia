/**
 * The format read from disk: a workflow folder's steps, the workflows a folder of them has, and what a person's name for a folder points
 * at.
 *
 * `workflow.ts` and the folders it re-exports are the format as data — the keys, their parsing and checking, and a step or an agent
 * written back — and read nothing; this file is what reads a folder and hands its text to them. A store file two levels above the bottom
 * of the tree beneath the controllers: of the store it imports only the agents read (`agents/read.store.ts`) and the skills read
 * (`skills/read.store.ts`, `test/boundary.test.ts`), and is exported from the package's root, not from `agent-orchestrator/workflow`
 * (`docs/architecture.md`). It keeps `agentUsers`, which reads step files through `workflowsIn`, not agents.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { AGENTS_FOLDER, isReadme, SKILLS_FOLDER, STEP_KEYS, WorkflowError, type StepKey, type Workflow } from '../step/step.ts';
import { PLACES } from '../keys/index.ts';
import {
  codexModeLine,
  formerFormLine,
  formerKeyLine,
  formerKeysIn,
  frontmatterKey,
  harnessPromptLine,
  inFormerForm,
  placeLine,
} from '../former/former.ts';
import { agentsDir, agentsFolderRefusal, parseFolder, readmeDescription, stepFiles, type Fills } from './folder.ts';
import { HARNESS_PROMPTS } from '../agents/agents.ts';
import { agentsFor } from '../agents/read.store.ts';
import { entriesOf, skillsFor, type Places } from '../skills/read.store.ts';

/**
 * Read a folder of steps and check that they form a workflow rather than a wish. A `README.md` in the folder
 * describes the workflow (`workflowDescription`) and is not a step. The steps come back in the order they run
 * (`orderSteps`), not the folder's, each resolved against the agent it names, found beside it or in `places` (`agentsFor`), and each skill
 * that agent gives found (`skillsFor`). A step `fills` hires an agent into is resolved against that agent, found the same way (`Fills`).
 */
export function loadWorkflows(dir: string, places: Places = {}, fills?: Fills): Workflow[] {
  if (!fs.existsSync(dir)) throw new WorkflowError(`no workflow folder at ${dir}`);
  const agents = agentsFolderRefusal(dir);
  if (agents) throw new WorkflowError(agents);
  const entries = fs.readdirSync(dir);
  const files = stepFiles(entries);
  if (!files.length) throw new WorkflowError(`${dir} has no .md steps in it${noStepsBecause(dir, entries)}`);

  const read = (file: string): string | undefined => {
    try {
      return fs.readFileSync(path.resolve(dir, file), 'utf8');
    } catch {
      return undefined;
    }
  };
  return parseFolder(
    files.map((f) => [path.basename(f, '.md'), fs.readFileSync(path.join(dir, f), 'utf8')]),
    read,
    agentsFor(dir, places),
    skillsFor(dir, places),
    fills,
  );
}

/**
 * A line for each file of the workflow in `dir` that still writes a key under its former name (`formerKeyLine`): its step files, then each
 * agent a step names, once. What `nemia start` prints after it has started the run, which the former names do not stop. None for a folder
 * that is not there, and a file that cannot be read says nothing here: the load has said why.
 *
 * A file that runs on codex — by its own `harness:` line, or a step's by its agent's — and still names its sandbox as `permissionMode:` is
 * named too (`codexModeLine`): the parser reads the line as `sandbox:`. So is an agent that still says `systemPrompt:`
 * (`harnessPromptLine`), which the parser reads as `harnessPrompt:`, and a step file that still says `workspace: folder` (`placeLine`),
 * which the parser reads as `place: folder`. And each step or agent file whose frontmatter is still in the former line form, not YAML
 * (`formerFormLine`): the parser reads it, and `nemia frontmatter rewrite` writes it as YAML.
 */
export function formerKeyLines(dir: string): string[] {
  const steps = stepTexts(dir);
  const agents = [...new Set(steps.flatMap(({ agent }) => agent ?? []))].sort();
  const codexMode = (at: string, text: string, harness: string | undefined): string[] => {
    const word = formerModeOf(text, harness);
    return word === undefined ? [] : [codexModeLine(at, word)];
  };
  return [
    ...steps.flatMap(({ file, text, harness }) => {
      const at = path.join(dir, file);
      return [
        ...(inFormerForm(text) ? [formerFormLine(at)] : []),
        ...formerKeysIn(text).map((former) => formerKeyLine(at, former)),
        ...codexMode(at, text, harness),
        ...(frontmatterKey(text, 'workspace') === 'folder' ? [placeLine(at)] : []),
      ];
    }),
    ...agents.flatMap((agent) => {
      const at = agentAt(dir, agent);
      const text = textAt(at);
      const prompt = frontmatterKey(text, 'systemPrompt');
      return [
        ...(inFormerForm(text) ? [formerFormLine(at)] : []),
        ...formerKeysIn(text).map((former) => formerKeyLine(at, former)),
        ...codexMode(at, text, frontmatterKey(text, 'harness')),
        ...(prompt === undefined ? [] : [harnessPromptLine(at, prompt)]),
      ];
    }),
  ];
}

/**
 * The word each step of the workflow in `dir` writes its sandbox under as `permissionMode:`, by the step's name: its own line, else, for a
 * step that writes no fence of its own, its agent's beside the folder. The parser reads the line as `sandbox:` (`codexSandboxNamed`), and
 * `nemia start` quotes a refusal of it as the file says it. None for a folder that is not there.
 */
export function formerModesWritten(dir: string): Record<string, string> {
  return Object.fromEntries(
    stepTexts(dir).flatMap(({ file, text, agent, harness }) => {
      const fenced = frontmatterKey(text, 'permissionMode') !== undefined || frontmatterKey(text, 'sandbox') !== undefined;
      const agentText = agent === undefined ? '' : textAt(agentAt(dir, agent));
      const word = fenced ? formerModeOf(text, harness) : formerModeOf(agentText, frontmatterKey(agentText, 'harness'));
      return word === undefined ? [] : [[path.basename(file, '.md'), word]];
    }),
  );
}

/** A file's text, or nothing for one that cannot be read: the load has said why. */
const textAt = (at: string): string => {
  try {
    return fs.readFileSync(at, 'utf8');
  } catch {
    return '';
  }
};

/** Where the agent `agent` a step of the workflow in `dir` names is written. */
const agentAt = (dir: string, agent: string): string => path.join(agentsDir(dir), `${agent}.md`);

/** The word a file on `harness` names its sandbox under as `permissionMode:`, the former name of `sandbox:` there; else undefined. */
const formerModeOf = (text: string, harness: string | undefined): string | undefined =>
  harness === 'codex' ? frontmatterKey(text, 'permissionMode') : undefined;

/**
 * Each step file of the workflow in `dir` with its text, the agent it names and the harness it runs on: its own `harness:`, else its
 * agent's. None for a folder that is not there.
 */
function stepTexts(dir: string): { file: string; text: string; agent?: string; harness?: string }[] {
  return stepFiles(entriesOf(dir)).map((file) => {
    const text = textAt(path.join(dir, file));
    const agent = frontmatterKey(text, 'agent');
    const harness =
      frontmatterKey(text, 'harness') ?? (agent === undefined ? undefined : frontmatterKey(textAt(agentAt(dir, agent)), 'harness'));
    return { file, text, agent, harness };
  });
}

/**
 * Why a folder has no steps, when the folder can say: a README, which is not one, or folders of steps beside each
 * other — `<repo>/workflows/`, which holds a repository's workflows, rather than one of them.
 */
function noStepsBecause(dir: string, entries: readonly string[]): string {
  const readme = entries.find(isReadme);
  if (readme) return ` — ${readme} describes the workflow, and is not a step. Write the first step beside it: implement.md, say.`;
  const workflows = workflowsIn(dir, entries);
  return workflows.length
    ? ` — it holds workflows, each a folder of steps: ${workflows.join(', ')}. Name one of them: ${path.join(dir, workflows[0])}.`
    : '';
}

/** The folders in `dir` that hold steps, sorted: the workflows a folder of workflows has. None for a folder that is not there. */
export function workflowsIn(dir: string, entries?: readonly string[]): string[] {
  return (entries ?? entriesOf(dir))
    .filter((name) => name !== AGENTS_FOLDER && name !== SKILLS_FOLDER && stepFiles(entriesOf(path.join(dir, name))).length > 0)
    .sort();
}

const isFolder = (at: string): boolean => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/**
 * The workflow folder a person names: a path, relative to where it is written — the directory `nemia start` is typed in, the plan folder a
 * card is in — or, when no folder is there and it is a bare name, the workflow of that name in `tree`, the tree of a factory made from a
 * template, then in the repository: `dev` is `<tree>/workflows/dev`, else `<repo>/workflows/dev`. The path is looked at first, so a folder
 * a person points at is never shadowed by one of the tree's or the repository's.
 *
 * Refused when none is a folder, naming where it looked and the workflows the repository has. Whether the folder is a workflow is
 * `loadWorkflows`' to say.
 */
export function workflowFolder(given: string, from: string, repo: string, tree?: string): string {
  const at = path.resolve(from, given);
  if (isFolder(at)) return at;
  const bare = !/[\\/]/.test(given) && given !== '.' && given !== '..';
  if (bare && given === AGENTS_FOLDER) throw new WorkflowError(agentsFolderRefusal(path.join(repo, 'workflows', given))!);
  if (bare && tree !== undefined && isFolder(path.join(tree, 'workflows', given))) return path.join(tree, 'workflows', given);
  const workflows = path.join(repo, 'workflows');
  if (bare && isFolder(path.join(workflows, given))) return path.join(workflows, given);
  const theirs = workflowsIn(workflows);
  throw new WorkflowError(
    `no workflow folder at ${at}${bare ? `, nor a workflow named ${given} in ${workflows}` : ''}. ` +
      (theirs.length
        ? `The repository's workflows are: ${theirs.join(', ')} — name one, or give the path to a workflow folder.`
        : `Give the path to a workflow folder, or the name of a folder of steps under ${workflows}.`),
  );
}

/**
 * Every step, in every workflow in `workflowsDir`, that names the agent `name` (`agent:`), as `<workflow>/<step>`, sorted. Each step file
 * is read as the parser reads its `agent:` line, so a folder that does not load counts as much as one that does: a step that names the
 * agent is broken by its going, whether or not something else is broken beside it.
 */
export function agentUsers(workflowsDir: string, name: string): string[] {
  const users: string[] = [];
  for (const workflow of workflowsIn(workflowsDir)) {
    const dir = path.join(workflowsDir, workflow);
    for (const file of stepFiles(fs.readdirSync(dir))) {
      let text: string;
      try {
        text = fs.readFileSync(path.join(dir, file), 'utf8');
      } catch {
        continue;
      }
      if (frontmatterKey(text, 'agent') === name) users.push(`${workflow}/${path.basename(file, '.md')}`);
    }
  }
  return users.sort();
}

/**
 * What a workflow is for, in its author's words: the first paragraph of its folder's README, its lines joined into one.
 *
 * Null when the folder has no README, or the README has nothing else (`readmeDescription`, which reads its text). Never throws: a README
 * that cannot be read describes nothing, and the steps beside it are `loadWorkflows`' to judge.
 */
export function workflowDescription(dir: string): string | null {
  const text = workflowReadme(dir);
  return text === null ? null : readmeDescription(text);
}

/**
 * A workflow's README in full, the workflow level's instruction: the text of the first README of its folder by name, any case, without a
 * leading byte order mark.
 *
 * Null when the folder has no README or it cannot be read. Never throws: the steps beside it are `loadWorkflows`' to judge.
 */
export function workflowReadme(dir: string): string | null {
  try {
    const readme = fs.readdirSync(dir).filter(isReadme).sort()[0];
    if (!readme) return null;
    return fs.readFileSync(path.join(dir, readme), 'utf8').replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

const Strings = Schema.mutable(Schema.Array(Schema.String));

/** An `output:` schema as the parser writes it (`OutputSchema`): strict, of an object, and every other key it has kept. */
const OutputSchemaSchema = Schema.StructWithRest(
  Schema.Struct({
    type: Schema.Literal('object'),
    properties: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
    required: Strings,
    additionalProperties: Schema.Literal(false),
  }),
  Rest,
);

/**
 * The agent a step names, as the parser resolves it (`StepAgent`): each key it gives one a step has (`STEP_KEYS`) or had (`FORMER_KEYS`),
 * its harness prompt under its name now or its former one, in the words each had (`FORMER_OWN_KEYS`), every other key kept.
 */
const StepAgentSchema = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.String,
    keys: Schema.mutable(Schema.Array(Schema.Literals([...STEP_KEYS, 'disallow', 'allow']))),
    body: Schema.String,
    given: Schema.Record(Schema.String, Schema.String),
    instructions: Schema.optionalKey(Schema.String),
    customInstructions: Schema.optionalKey(Schema.String),
    factoryRules: Schema.optionalKey(Schema.String),
    skills: Schema.optionalKey(Strings),
    addedSkills: Schema.optionalKey(Strings),
    agentDenies: Schema.optionalKey(Strings),
    harnessPrompt: Schema.optionalKey(Schema.Literals(HARNESS_PROMPTS)),
    mcp: Schema.optionalKey(Strings),
    systemPrompt: Schema.optionalKey(Schema.Literals(['default', 'no-coding', 'own'])),
  }),
  Rest,
);

/** A field for every key a step has (`STEP_KEYS`), with its name and body: a key added there and not here fails the typecheck. */
export type FrozenStepFields = { readonly [K in StepKey | 'name' | 'body']: Schema.Top };

const frozenStepFields = {
  name: Schema.String,
  body: Schema.String,
  after: Strings,
  resume: Schema.optionalKey(Schema.String),
  input: Schema.optionalKey(Strings),
  place: Schema.optionalKey(Schema.Literals(PLACES)),
  workspace: Schema.optionalKey(Schema.Literals(['main', 'folder'])),
  writable: Schema.optionalKey(Strings),
  reads: Schema.optionalKey(Strings),
  slot: Schema.optionalKey(Schema.Literal('none')),
  agent: Schema.optionalKey(StepAgentSchema),
  skills: Schema.optionalKey(Strings),
  mcp: Schema.optionalKey(Strings),
  harness: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(Schema.String),
  context: Schema.optionalKey(Schema.Finite),
  permissionMode: Schema.optionalKey(Schema.String),
  sandbox: Schema.optionalKey(Schema.String),
  tools: Schema.optionalKey(Strings),
  disallowedTools: Schema.optionalKey(Strings),
  allowedTools: Schema.optionalKey(Strings),
  denials: Schema.optionalKey(Schema.Literal('fail')),
  background: Schema.optionalKey(Schema.Boolean),
  remote: Schema.optionalKey(Schema.Boolean),
  deadlineSeconds: Schema.optionalKey(Schema.Finite),
  budget: Schema.optionalKey(Schema.Finite),
  check: Schema.optionalKey(Schema.String),
  retries: Schema.optionalKey(Schema.Finite),
  gate: Schema.optionalKey(Schema.Literal(true)),
  output: Schema.optionalKey(
    Schema.StructWithRest(
      Schema.Struct({
        file: Schema.String,
        schema: OutputSchemaSchema,
        owners: Schema.optionalKey(
          Schema.Record(Schema.String, Schema.Struct({ by: Schema.Literals(['agent', 'step']), name: Schema.String, file: Schema.String })),
        ),
      }),
      Rest,
    ),
  ),
  tally: Schema.optionalKey(Strings),
  loop: Schema.optionalKey(Schema.String),
  rounds: Schema.optionalKey(Schema.Finite),
} satisfies FrozenStepFields;

/** A field under each former name of a key (`FORMER_KEYS`), checked as the key it is now: what `asNamed` moves onto that key. */
const formerStepFields = { disallow: frozenStepFields.disallowedTools, allow: frozenStepFields.allowedTools };

/**
 * A step as the run froze it at `nemia start`: the parser's output (`Workflow`), each key of `STEP_KEYS`, and each under its former name
 * (`FORMER_KEYS`), checked for the type the parser gives it. It checks the shape, not the vocabulary: a harness, a model or a mode is any
 * text, a count any number, judged when the step is filed, so a word retired since the run started does not lose the run. Every key it
 * does not name is kept, as a record a newer `nemia` wrote keeps it. Read under the names its keys have now by `asNamed`.
 */
export const FrozenStepSchema = Schema.StructWithRest(Schema.Struct({ ...frozenStepFields, ...formerStepFields }), Rest);
