/**
 * The format read from disk: a workflow folder's steps, the workflows a folder of them has, and what a person's name for a folder points
 * at.
 *
 * `workflow.ts` and the folders it re-exports are the format as data — the keys, their parsing and checking, and a step or an agent
 * written back — and read nothing; this file is what reads a folder and hands its text to them. A store file two levels above the bottom
 * of the tree beneath the controllers: of the store it imports only the agents read (`agents/read.store.ts`) and the skill reads
 * (`skills/read.store.ts`, `test/boundary.test.ts`), and is exported from the package's root, not from `agent-orchestrator/workflow`
 * (`docs/architecture.md`). It keeps `agentUsers`, which reads step files through `workflowsIn`, not agents. It finds no agent or skill
 * itself: a folder is parsed against those the Workflow door found (`loadWorkflowsWith`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { frontmatterValues } from '../frontmatter/frontmatter.ts';
import { FIELD_SHAPES, Need } from 'objects';
import { firstPiece } from '../piece/piece.ts';
import {
  AGENTS_FOLDER,
  CARRIED_FOLDER,
  FRONTMATTER,
  isReadme,
  NODE_CARDS,
  SKILLS_FOLDER,
  STEP_KEYS,
  WorkflowError,
  type StepKey,
  type StepSpec,
} from '../step/step.ts';
import { PLACES } from '../keys/index.ts';
import {
  codexModeLine,
  FORMER_HARNESS_PROMPTS,
  FORMER_KEYS,
  formerKeyLine,
  formerKeysIn,
  formerFenceIn,
  formerFenceLine,
  overridableLine,
  frontmatterKey,
  harnessPromptLine,
  placeLine,
  baseLine,
} from '../former/former.ts';
import {
  agentsDir,
  agentsFolderRefusal,
  parseFolder,
  readmeComposed,
  readmeDescription,
  stepFiles,
  workflowDirRefusal,
  type Fills,
  type Found,
} from './folder.ts';
import { WorkflowDir } from './folder.model.ts';
import { HARNESS_PROMPTS } from '../agents/agents.ts';
import { fenceKeyOf } from '../harness/harness.ts';
import { entriesOf } from '../skills/read.store.ts';

/**
 * Read a folder of steps and check that they form a workflow rather than a wish, against the agents and skills already `found`: what the
 * Workflow door's files read with, having found them through the Agent and Skill doors (`loadWorkflows`, `workflows.store.ts`). A
 * `README.md` in the folder describes the workflow (`workflowDescription`) and is not a step. The steps come back in the order they run
 * (`orderSteps`), not the folder's, each resolved against the agent it names, and each skill that agent gives found. A step `fills` hires
 * an agent into is resolved against that agent, found the same way (`Fills`).
 * @param dir The workflow's folder.
 * @param found The agents and skills already found, which the steps are resolved against.
 * @param fills What a factory gives the steps: the agent each is hired and its rules; undefined where no factory gives any.
 */
export function loadWorkflowsWith(dir: string, found: Found, fills?: Fills) {
  if (!fs.existsSync(dir)) throw new WorkflowError(`no workflow folder at ${dir}`);
  const agents = agentsFolderRefusal(dir);
  if (agents) throw new WorkflowError(agents);
  const entries = fs.readdirSync(dir);
  const files = stepFiles(entries);
  if (!files.length) throw new WorkflowError(`${dir} has no .md steps in it${noStepsBecause(dir, entries)}`);

  const read = (file: string) => {
    try {
      return fs.readFileSync(path.resolve(dir, file), 'utf8');
    } catch {
      return undefined;
    }
  };
  return parseFolder(
    files.map((f) => [path.basename(f, '.md'), fs.readFileSync(path.join(dir, f), 'utf8')]),
    read,
    found.agents,
    found.skills,
    fills,
  ) satisfies StepSpec[];
}

/**
 * A line for each file of the workflow in `dir` that still writes a key under its former name (`formerKeyLine`): its step files, then each
 * agent a step names, once. What `nemia start` prints after it has started the run, which the former names do not stop. None for a folder
 * that is not there, and a file that cannot be read says nothing here: the load has said why.
 *
 * A file that runs on codex — by its own `harness:` line, or a step's by its agent's — and still names its sandbox as `permissionMode:` is
 * named too (`codexModeLine`): the parser reads the line as `sandbox:`. So is an agent that still says `systemPrompt:`
 * (`harnessPromptLine`), which the parser reads as `harnessPrompt:`, and a step file that still says `workspace: folder` (`placeLine`),
 * which the parser reads as `place: folder`, or `workspace: main` (`baseLine`), which it reads as `workspace: base`. A frontmatter still in
 * the former line form is not named here: the load refuses it, at its line (`readFrontmatter`).
 * @param dir The workflow's folder.
 */
export function formerKeyLines(dir: string) {
  const steps = stepTexts(dir);
  const agents = [...new Set(steps.flatMap(({ agent }) => agent ?? []))].sort();
  const codexMode = (at: string, text: string, harness: string | undefined) => {
    const word = formerModeOf(text, harness);
    return word === undefined ? [] : [codexModeLine(at, word)];
  };
  return [
    ...steps.flatMap(({ file, text, harness }) => {
      const at = path.join(dir, file);
      return [
        ...formerKeysIn(text).map((former) => formerKeyLine(at, former)),
        ...formerFenceIn(text).map((key) => formerFenceLine(at, key)),
        ...codexMode(at, text, harness),
        ...(frontmatterKey(text, 'workspace') === 'folder' ? [placeLine(at)] : []),
        ...(frontmatterKey(text, 'workspace') === 'main' ? [baseLine(at)] : []),
      ];
    }),
    ...agents.flatMap((agent) => {
      const at = agentAt(dir, agent);
      const text = textAt(at);
      const prompt = frontmatterKey(text, 'systemPrompt');
      return [
        ...formerKeysIn(text).map((former) => formerKeyLine(at, former)),
        ...formerFenceIn(text).map((key) => formerFenceLine(at, key)),
        ...codexMode(at, text, frontmatterKey(text, 'harness')),
        ...(prompt === undefined ? [] : [harnessPromptLine(at, prompt)]),
        ...(text && frontmatterKey(text, 'overridable') === undefined ? [overridableLine(at)] : []),
      ];
    }),
  ];
}

/**
 * The word each step of the workflow in `dir` writes its sandbox under as `permissionMode:`, by the step's name: its own line, else, for a
 * step that writes no fence of its own, its agent's beside the folder. The parser reads the line as `sandbox:` (`codexSandboxNamed`), and
 * `nemia start` quotes a refusal of it as the file says it. None for a folder that is not there.
 * @param dir The workflow's folder.
 */
export function formerModesWritten(dir: string) {
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
const textAt = (at: string) => {
  try {
    return fs.readFileSync(at, 'utf8');
  } catch {
    return '';
  }
};

/** Where the agent `agent` a step of the workflow in `dir` names is written. */
const agentAt = (dir: string, agent: string) => path.join(agentsDir(dir), `${agent}.md`);

/** The word a file on `harness` names its sandbox under as `permissionMode:`, the former name of `sandbox:` there; else undefined. */
const formerModeOf = (text: string, harness: string | undefined) =>
  fenceKeyOf(harness) === 'sandbox' ? frontmatterKey(text, 'permissionMode', true) : undefined;

/**
 * Each step file of the workflow in `dir` with its text, the agent it names and the harness it runs on: its own `harness:`, else its
 * agent's. None for a folder that is not there.
 */
function stepTexts(dir: string) {
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
function noStepsBecause(dir: string, entries: readonly string[]) {
  const readme = entries.find(isReadme);
  if (readme) return ` — ${readme} describes the workflow, and is not a step. Write the first step beside it: implement.md, say.`;
  const workflows = workflowsIn(dir, entries);
  const [first] = workflows;
  return first !== undefined
    ? ` — it holds workflows, each a folder of steps: ${workflows.join(', ')}. Name one of them: ${path.join(dir, first)}.`
    : '';
}

/**
 * The folders in `dir` that hold steps, sorted: the workflows a folder of workflows has. None for a folder that is not there.
 * @param dir The folder of workflows.
 * @param entries The names in `dir` where the caller listed them already; listed here where not given.
 */
export function workflowsIn(dir: string, entries?: readonly string[]) {
  return (entries ?? entriesOf(dir))
    .filter(
      (name) => ![AGENTS_FOLDER, SKILLS_FOLDER, CARRIED_FOLDER].includes(name) && stepFiles(entriesOf(path.join(dir, name))).length > 0,
    )
    .sort();
}

const isFolder = (at: string) => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/**
 * The folder `dir` as the Workflow door's id (`WorkflowDir`), or refused as a `WorkflowError` in `workflowDirRefusal`'s words: where a
 * folder is resolved, the one place besides a stored record a `WorkflowDir` comes from.
 * @param dir The workflow folder's path.
 */
export function workflowDirAt(dir: string) {
  const refused = workflowDirRefusal(dir);
  if (refused !== null) throw new WorkflowError(refused);
  return WorkflowDir.read(dir);
}

/**
 * The workflow folder a person names: a path, relative to where it is written — the directory `nemia start` is typed in, the plan folder a
 * card is in — or, when no folder is there and it is a bare name, the workflow of that name in `tree`, the tree of a factory made from a
 * template, then in the repository: `dev` is `<tree>/workflows/dev`, else `<repo>/workflows/dev`. The path is looked at first, so a folder
 * a person points at is never shadowed by one of the tree's or the repository's.
 *
 * Answered as a `WorkflowDir`, absolute and resolved (`workflowDirAt`). Refused when none is a folder, naming where it looked and the
 * workflows the repository has. Whether the folder is a workflow is `loadWorkflows`' (`workflows/workflows.store.ts`) to say.
 * @param given The path or bare name the person wrote.
 * @param from The directory a relative path is resolved from.
 * @param repo The repository whose `workflows/` a bare name is looked up in.
 * @param tree The tree of a factory made from a template, looked in before the repository; undefined where there is none.
 */
export function workflowFolder(given: string, from: string, repo: string, tree?: string) {
  const at = path.resolve(from, given);
  if (isFolder(at)) return workflowDirAt(at) satisfies WorkflowDir as WorkflowDir;
  const bare = !/[\\/]/.test(given) && given !== '.' && given !== '..';
  const agentsRefused = bare && given === AGENTS_FOLDER ? agentsFolderRefusal(path.join(repo, 'workflows', given)) : undefined;
  if (agentsRefused !== undefined) throw new WorkflowError(agentsRefused);
  if (bare && tree !== undefined && isFolder(path.join(tree, 'workflows', given)))
    return workflowDirAt(path.resolve(tree, 'workflows', given)) satisfies WorkflowDir as WorkflowDir;
  const workflows = path.join(repo, 'workflows');
  if (bare && isFolder(path.join(workflows, given)))
    return workflowDirAt(path.resolve(workflows, given)) satisfies WorkflowDir as WorkflowDir;
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
 * @param workflowsDir The folder of workflows to look through.
 * @param name The agent's name.
 */
export function agentUsers(workflowsDir: string, name: string) {
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
 * that cannot be read describes nothing, and the steps beside it are `loadWorkflows`' (`workflows/workflows.store.ts`) to judge.
 * @param dir The workflow's folder.
 */
export function workflowDescription(dir: string) {
  const text = workflowReadme(dir);
  return text === null ? null : readmeDescription(text);
}

/**
 * A workflow's README in full, the workflow level's instruction: the text of the first README of its folder by name, any case, without a
 * leading byte order mark and without its frontmatter, which declares the workflow's machine needs (`workflowNeeds`) and is no
 * instruction.
 *
 * Null when the folder has no README or it cannot be read. Never throws: the steps beside it are `loadWorkflows`'
 * (`workflows/workflows.store.ts`) to judge.
 * @param dir The workflow's folder.
 */
export function workflowReadme(dir: string) {
  const text = readmeText(dir);
  return text === null ? null : text.replace(/\r\n/g, '\n').replace(FRONTMATTER, '');
}

/** The text of the first README of the folder `dir` by name, any case, frontmatter and all, without a leading byte order mark; or null. */
function readmeText(dir: string) {
  try {
    const readme = fs.readdirSync(dir).filter(isReadme).sort()[0];
    if (!readme) return null;
    return fs.readFileSync(path.join(dir, readme), 'utf8').replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

/** The needs a README's frontmatter declares, as a Schema reads them. */
const NeedsDeclared = Schema.Struct({ needs: Schema.optionalKey(Schema.Array(Need)) });

/**
 * The machine needs a README's `text` declares in its frontmatter (`needs:`), none where it has no frontmatter or names none; and why they
 * do not read (`why`, the decoder's words), none then. Pure.
 * @param text The README's text, frontmatter and all.
 */
export function needsDeclaredIn(text: string) {
  const block = FRONTMATTER.exec(text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'))?.[1];
  if (block === undefined) return { needs: [] };
  try {
    return { needs: Schema.decodeUnknownSync(NeedsDeclared)(frontmatterValues(block) ?? {}).needs ?? [] };
  } catch (err) {
    return { needs: [], why: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The machine needs the workflow of the folder `dir` declares, read off its README's frontmatter (`needs:`, each a `Need`: its name, what
 * it is, the shell command whose exit 0 says it is in place, its fixes and the place need it `fills`), and why they could not be read
 * (`error`, naming the file and what to mend), none then. None for a folder with no README, one with no frontmatter, and one whose
 * frontmatter names no needs. Never throws: a run whose needs cannot be read waits on none of them, and the readiness read says why.
 * @param dir The workflow's folder.
 */
export function workflowNeedsRead(dir: string) {
  const text = readmeText(dir);
  if (text === null) return { needs: [] };
  const { needs, why } = needsDeclaredIn(text);
  if (why === undefined) return { needs };
  return {
    needs: [],
    error: `${path.join(dir, 'README.md')}'s frontmatter declares no needs that read (${firstPiece(why, '\n')}): mend its \`needs:\` list — each a name, a message and a check.`,
  };
}

/**
 * The machine needs the workflow of the folder `dir` declares in its README's frontmatter (`workflowNeedsRead`), none where none read.
 * @param dir The workflow's folder.
 */
export const workflowNeeds = (dir: string) => workflowNeedsRead(dir).needs;

/**
 * The README a writer of the workflow of the folder `dir` hands `writeWorkflow` as `readme` (`write.store.ts`): `body` as given where it
 * opens with a frontmatter of its own, so the README a read served is written back byte for byte, otherwise `body` as the instruction
 * under the README's own frontmatter (`readmeComposed`). Undefined where none is given: the README is left as it is.
 * @param dir The workflow's folder, whose README on disk gives the frontmatter a bare instruction is written under.
 * @param body The README to write, whole or its instruction alone, or undefined to keep the README's own.
 */
export function workflowReadmeWith(dir: string, body: string | undefined) {
  return readmeComposed(readmeText(dir) ?? '', body);
}

/**
 * The README a Workflow's `spec` writes into the folder `dir`, whichever writer writes it — the api's `PUT` and a proposal's apply alike:
 * its `readme` as `workflowReadmeWith` writes it; undefined where it gives none (null or left out), the README left as it is.
 * @param dir The workflow's folder.
 * @param spec The Workflow's spec, of which its `readme` is read.
 */
export const workflowSpecReadme = (dir: string, spec: { readonly readme?: string | null }) =>
  workflowReadmeWith(dir, spec.readme ?? undefined);

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
 * The words a former `systemPrompt:` line said: each former word of `harnessPrompt:` (`FORMER_HARNESS_PROMPTS`), and each word of it that
 * kept its name (`no-coding`).
 */
const SYSTEM_PROMPT_WORDS: readonly string[] = [
  ...Object.keys(FORMER_HARNESS_PROMPTS),
  ...HARNESS_PROMPTS.filter((word) => !Object.values(FORMER_HARNESS_PROMPTS).includes(word)),
];

/**
 * The agent a step names, as the parser resolves it (`StepAgent`): each key it gives one a step has (`STEP_KEYS`) or had (`FORMER_KEYS`),
 * its harness prompt under its name now or its former one, in the words each had (`FORMER_OWN_KEYS`), every other key kept.
 */
const StepAgentSchema = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.String,
    keys: Schema.mutable(Schema.Array(Schema.Literals([...STEP_KEYS, ...Object.keys(FORMER_KEYS)]))),
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
    systemPrompt: Schema.optionalKey(Schema.Literals(SYSTEM_PROMPT_WORDS)),
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
  workspace: Schema.optionalKey(Schema.Literals(['main', 'base', 'folder'])),
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
  remote: Schema.optionalKey(Schema.Boolean),
  deadlineSeconds: Schema.optionalKey(Schema.Finite),
  memory: Schema.optionalKey(Schema.String),
  budget: Schema.optionalKey(Schema.Finite),
  check: Schema.optionalKey(Schema.String),
  checks: Schema.optionalKey(
    Schema.Array(
      Schema.StructWithRest(Schema.Struct({ name: Schema.String, run: Schema.String, after: Schema.Array(Schema.String) }), Rest),
    ),
  ),
  run: Schema.optionalKey(Schema.String),
  checkMemory: Schema.optionalKey(Schema.String),
  memoryRequest: Schema.optionalKey(Schema.String),
  retries: Schema.optionalKey(Schema.Finite),
  checkFailurePolicy: Schema.optionalKey(
    Schema.StructWithRest(
      Schema.Struct({
        rules: Schema.Array(
          Schema.StructWithRest(
            Schema.Struct({
              action: Schema.Literals(['FailStep', 'Count']),
              onExitCodes: Schema.StructWithRest(
                Schema.Struct({ operator: Schema.Literals(['In', 'NotIn']), values: Schema.Array(Schema.Finite) }),
                Rest,
              ),
            }),
            Rest,
          ),
        ),
      }),
      Rest,
    ),
  ),
  gate: Schema.optionalKey(Schema.Literal(true)),
  output: Schema.optionalKey(
    Schema.StructWithRest(
      Schema.Struct({
        file: Schema.String,
        schema: OutputSchemaSchema,
        owners: Schema.optionalKey(
          Schema.Record(Schema.String, Schema.Struct({ by: Schema.Literals(['agent', 'step']), name: Schema.String, file: Schema.String })),
        ),
        shapes: Schema.optionalKey(Schema.Record(Schema.String, Schema.Literals(FIELD_SHAPES))),
      }),
      Rest,
    ),
  ),
  tally: Schema.optionalKey(Strings),
  loop: Schema.optionalKey(Schema.String),
  rounds: Schema.optionalKey(Schema.Finite),
  routes: Schema.optionalKey(Strings),
  route: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ kind: Schema.Literal('table'), from: Schema.String, table: Schema.Record(Schema.String, Schema.String) }),
      Schema.Struct({ kind: Schema.Literal('script'), script: Schema.String }),
      Schema.Struct({ kind: Schema.Literal('judge') }),
    ]),
  ),
  when: Schema.optionalKey(Strings),
  ends: Schema.optionalKey(Strings),
  workflow: Schema.optionalKey(Schema.String),
  card: Schema.optionalKey(Schema.Literals(NODE_CARDS)),
  relabel: Schema.optionalKey(Strings),
} satisfies FrozenStepFields;

/** A field under each former name of a key (`FORMER_KEYS`), checked as the key it is now: what `asNamed` moves onto that key. */
const formerStepFields = { disallow: frozenStepFields.disallowedTools, allow: frozenStepFields.allowedTools };

/**
 * A field of each key a step no longer has, still read off a run frozen with it, as it was typed: `background`, which ran a step's sessions
 * as background sessions before every session ran on the Agent SDK. Kept decoded and read by nothing: the step is filed as a job, and
 * the ends of its sessions said no denials, which the stats read as not measured.
 */
const retiredStepFields = { background: Schema.optionalKey(Schema.Boolean) };

/**
 * A step as the run froze it at `nemia start`: the parser's output (`StepSpec`), each key of `STEP_KEYS`, each under its former name
 * (`FORMER_KEYS`), and each key retired since (`retiredStepFields`), checked for the type the parser gives it. It checks the shape, not
 * the vocabulary: a harness, a model or a mode is any text, a count any number, judged when the step is filed, so a word retired since
 * the run started does not lose the run. Every key it does not name is kept, as a record a newer `nemia` wrote keeps it. Read under the
 * names its keys have now by `asNamed`.
 */
export const FrozenStepSchema = Schema.StructWithRest(
  Schema.Struct({ ...frozenStepFields, ...formerStepFields, ...retiredStepFields }),
  Rest,
);
