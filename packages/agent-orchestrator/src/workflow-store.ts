/**
 * The format read from disk: a workflow folder's steps, the agents beside it, and what a person's name for a folder points at.
 *
 * `workflow.ts` is the format as data — the keys, their parsing and checking, and a step or an agent written back — and reads nothing;
 * this file is what reads a folder and hands its text to it. A store file at the bottom of the tree beneath the controllers: it imports no
 * other (`test/boundary.test.ts`), and is exported from the package's root, not from `agent-orchestrator/workflow`
 * (`docs/architecture.md`).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import {
  AGENTS_FOLDER,
  agentsDir,
  agentsFolderRefusal,
  codexModeLine,
  formerKeyLine,
  formerKeysIn,
  frontmatterKey,
  isCardFile,
  isReadme,
  linkRefusal,
  ownSkill,
  parseAgent,
  parseFolder,
  readmeDescription,
  skillEntryOf,
  SKILLS_FOLDER,
  splitFrontmatter,
  STEP_KEYS,
  stepFiles,
  SYSTEM_PROMPTS,
  WorkflowError,
  type Agent,
  type Agents,
  type AgentSkill,
  type SkillsFound,
  type StepKey,
  type Workflow,
} from './workflow.ts';

/**
 * Where else a workflow's agents and skills are looked for, beside its own folder: the repository it runs on, whose `.claude/agents/` and
 * `.claude/skills/` are read, and the store (`WF_ROOT`), whose `workflows/agents/` and `workflows/skills/` are. With neither, a workflow
 * finds only what is beside it.
 */
export type Places = { repo?: string; home?: string };

/**
 * The folders a workflow's agents and skills are looked for in, each holding an `agents/` and a `skills/`, in the order a name is found:
 * the workflow's own root (the folder beside it, `agentsDir`'s parent), then the repository's `.claude/`, then the store's `workflows/`.
 * So the repository wins over the store, and a workflow of the store finds its own first. One folder is listed once.
 */
export function lookupRoots(workflowDir: string, places: Places = {}): string[] {
  const roots = [path.dirname(agentsDir(workflowDir))];
  if (places.repo) roots.push(path.join(path.resolve(places.repo), '.claude'));
  if (places.home) roots.push(path.join(path.resolve(places.home), 'workflows'));
  return [...new Set(roots)];
}

/**
 * Whether two of `roots` are one repository's two places — its `workflows/` and its `.claude/` — where a name in both is refused rather than
 * one of them chosen: a person reading either folder would take the one before them for the one that runs.
 */
const sameRepository = (a: string, b: string): boolean =>
  path.dirname(a) === path.dirname(b) && [path.basename(a), path.basename(b)].sort().join() === '.claude,workflows';

/**
 * Every agent a workflow's steps may name (`lookupRoots`), each read or the refusal of it, as `loadAgents` reads one folder: the first root
 * that has a name wins, and a name one repository has in both `workflows/agents/` and `.claude/agents/` is refused, naming both.
 */
export function agentsFor(workflowDir: string, places: Places = {}): Agents {
  const found = new Map<string, { at: string; agent: Agent | WorkflowError }>();
  for (const root of lookupRoots(workflowDir, places)) {
    const dir = path.join(root, AGENTS_FOLDER);
    for (const [name, agent] of loadAgents(dir)) {
      const first = found.get(name);
      if (!first) {
        found.set(name, { at: root, agent });
        continue;
      }
      if (sameRepository(first.at, root)) {
        found.set(name, {
          at: first.at,
          agent: new WorkflowError(
            `${name} is an agent in both ${path.join(first.at, AGENTS_FOLDER, `${name}.md`)} and ${path.join(dir, `${name}.md`)}, one repository's two places for agents, and nothing says which runs. Keep one of them.`,
          ),
        });
      }
    }
  }
  return new Map([...found].map(([name, { agent }]) => [name, agent]));
}

/**
 * Every skill a workflow's agents may give (`lookupRoots`): each name, the folder it is — `<root>/skills/<name>`, holding a `SKILL.md` — or
 * the refusal of a name one repository has in both `workflows/skills/` and `.claude/skills/`. The first root that has a name wins, and the
 * roots are named for the refusal of a name none has (`skillAt`).
 */
export function skillsFor(workflowDir: string, places: Places = {}): SkillsFound {
  const roots = lookupRoots(workflowDir, places);
  const found = new Map<string, { at: string; dir: string | WorkflowError }>();
  for (const root of roots) {
    const dir = path.join(root, SKILLS_FOLDER);
    let names: string[];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      const at = path.join(dir, name);
      if (!fs.statSync(path.join(at, 'SKILL.md'), { throwIfNoEntry: false })?.isFile()) continue;
      const first = found.get(name);
      if (!first) {
        found.set(name, { at: root, dir: at });
        continue;
      }
      if (sameRepository(first.at, root)) {
        found.set(name, {
          at: first.at,
          dir: new WorkflowError(
            `${name} is a skill in both ${path.join(first.at, SKILLS_FOLDER, name)} and ${at}, one repository's two places for skills, and nothing says which a session is given. Keep one of them.`,
          ),
        });
      }
    }
  }
  return { at: new Map([...found].map(([name, { dir }]) => [name, dir])), looked: roots.map((root) => path.join(root, SKILLS_FOLDER)) };
}

/**
 * Read a folder of steps and check that they form a workflow rather than a wish. A `README.md` in the folder
 * describes the workflow (`workflowDescription`) and is not a step. The steps come back in the order they run
 * (`orderSteps`), not the folder's, each resolved against the agent it names, found beside it or in `places` (`agentsFor`), and each skill
 * that agent gives found (`skillsFor`).
 */
export function loadWorkflows(dir: string, places: Places = {}): Workflow[] {
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
  );
}

/**
 * A line for each file of the workflow in `dir` that still writes a key under its former name (`formerKeyLine`): its step files, then each
 * agent a step names, once. What `wf start` prints after it has started the run, which the former names do not stop. None for a folder that
 * is not there, and a file that cannot be read says nothing here: the load has said why.
 *
 * A file that runs on codex — by its own `harness:` line, or a step's by its agent's — and still names its sandbox as `permissionMode:` is
 * named too (`codexModeLine`): the parser reads the line as `sandbox:`.
 */
export function formerKeyLines(dir: string): string[] {
  const read = (at: string): string => {
    try {
      return fs.readFileSync(at, 'utf8');
    } catch {
      return '';
    }
  };
  let files: string[];
  try {
    files = stepFiles(fs.readdirSync(dir));
  } catch {
    return [];
  }
  const steps = files.map((file) => [file, read(path.join(dir, file))] as const);
  const agents = [...new Set(steps.flatMap(([, text]) => frontmatterKey(text, 'agent') ?? []))].sort();
  const agentAt = (agent: string): string => path.join(agentsDir(dir), `${agent}.md`);
  const codexMode = (at: string, text: string, harness: string | undefined): string[] => {
    const word = frontmatterKey(text, 'permissionMode');
    return harness === 'codex' && word !== undefined ? [codexModeLine(at, word)] : [];
  };
  return [
    ...steps.flatMap(([file, text]) => {
      const at = path.join(dir, file);
      const agent = frontmatterKey(text, 'agent');
      const harness =
        frontmatterKey(text, 'harness') ?? (agent === undefined ? undefined : frontmatterKey(read(agentAt(agent)), 'harness'));
      return [...formerKeysIn(text).map((former) => formerKeyLine(at, former)), ...codexMode(at, text, harness)];
    }),
    ...agents.flatMap((agent) => {
      const at = agentAt(agent);
      const text = read(at);
      return [...formerKeysIn(text).map((former) => formerKeyLine(at, former)), ...codexMode(at, text, frontmatterKey(text, 'harness'))];
    }),
  ];
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
  let names: readonly string[];
  try {
    names = entries ?? fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => {
      if (name === AGENTS_FOLDER || name === SKILLS_FOLDER) return false;
      try {
        return stepFiles(fs.readdirSync(path.join(dir, name))).length > 0;
      } catch {
        return false;
      }
    })
    .sort();
}

const isFolder = (at: string): boolean => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/**
 * The workflow folder a person names: a path, relative to where it is written — the directory `wf start` is typed in, the plan folder a
 * card is in — or, when no folder is there and it is a bare name, the repository's workflow of that name: `dev` is `<repo>/workflows/dev`.
 * The path is looked at first, so a folder a person points at is never shadowed by one of the repository's.
 *
 * Refused when neither is a folder, naming where it looked and the workflows the repository has. Whether the folder is a workflow is
 * `loadWorkflows`' to say.
 */
export function workflowFolder(given: string, from: string, repo: string): string {
  const at = path.resolve(from, given);
  if (isFolder(at)) return at;
  const bare = !/[\\/]/.test(given) && given !== '.' && given !== '..';
  if (bare && given === AGENTS_FOLDER) throw new WorkflowError(agentsFolderRefusal(path.join(repo, 'workflows', given))!);
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
 * The agents in `dir` — a workflow's are in `agentsDir(<workflow>)` — by name: every `.md` but a README, each read (`parseAgent`) or the
 * refusal of it, which is thrown only at a step that names it, so a broken agent stops no workflow that does not use it. A file that is a
 * link is refused by name: an agent's file is its own, as a step's is. None for a folder that is not there.
 */
export function loadAgents(dir: string): Map<string, Agent | WorkflowError> {
  const agents = new Map<string, Agent | WorkflowError>();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return agents;
  }
  const read = (file: string): string | undefined => {
    try {
      return fs.readFileSync(path.resolve(dir, file), 'utf8');
    } catch {
      return undefined;
    }
  };
  for (const file of stepFiles(entries.map((e) => e.name))) {
    const name = path.basename(file, '.md');
    const at = path.join(dir, file);
    try {
      if (entries.find((e) => e.name === file)!.isSymbolicLink()) {
        throw new WorkflowError(
          linkRefusal(
            at,
            `an agent's file is its own: read through a link, what every step naming ${AGENTS_FOLDER}/${file} is told would be whatever the link points at, outside the folder, and would change with it.`,
          ),
        );
      }
      agents.set(name, parseAgent(name, fs.readFileSync(at, 'utf8'), read));
    } catch (err) {
      if (!(err instanceof WorkflowError)) throw err;
      agents.set(name, err);
    }
  }
  return agents;
}

/**
 * Every step, in every workflow in `workflowsDir`, that names the agent `name` (`agent:`), as `<workflow>/<step>`, sorted. Each step file is
 * read as the parser reads its `agent:` line, so a folder that does not load counts as much as one that does: a step that names the agent
 * is broken by its going, whether or not something else is broken beside it.
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
 * What an agent's files hold, as one word, or `null` for an agent that is not there: a digest of `<name>.md`, of the file it names beside
 * it — the schema its `output:` names — and of each skill its `skills:` gives, every file of the skill's
 * folder, each by name with what it holds, so a file that cannot be read counts as what it says. A write of the agent carries it, and is
 * refused when the agent's files hold another (`writeAgent`), rather than written over what changed since it was read. The api's `versionOf`
 * digests a folder's agents through this, so an edit of a skill moves the folder's version too — and so does its card, which is read off
 * those skills' SKILL.md files (`cardSkills`).
 *
 * `skills` are where the skills are found (`skillsFor`); without them, in the `skills/` beside `dir`. A skill found nowhere counts as missing.
 */
export function agentVersion(dir: string, name: string, skills?: SkillsFound): string | null {
  const at = path.join(dir, `${name}.md`);
  if (!fs.lstatSync(at, { throwIfNoEntry: false })) return null;
  const text = readForVersion(at);
  const beside = typeof text === 'string' ? [frontmatterKey(text, 'output') ?? []].flat() : [];
  const given = typeof text === 'string' ? skillNamesIn(text) : [];
  const found = skills ?? skillsFor(path.join(path.dirname(path.resolve(dir)), '_'));
  const files = [
    [`${name}.md`, text],
    ...beside.map((file) => [file, readForVersion(path.resolve(dir, file))]),
    ...given.map((skill) => {
      const folder = found.at.get(skill);
      return [`skills/${skill}`, typeof folder === 'string' ? folderForVersion(folder) : { missing: skill }];
    }),
  ];
  return createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
}

/**
 * The version of the skill whose folder is `dir`: a digest of every file in it, as `agentVersion` counts the folder of each skill an agent
 * gives — so a write that moves this moves the version of every agent that gives the skill. Null for a folder with no SKILL.md. A write of the
 * skill carries it, and is refused when the skill's folder holds another (`writeSkill`).
 */
export function skillVersion(dir: string): string | null {
  if (!fs.lstatSync(path.join(dir, 'SKILL.md'), { throwIfNoEntry: false })) return null;
  return createHash('sha256')
    .update(JSON.stringify(folderForVersion(dir)))
    .digest('hex')
    .slice(0, 16);
}

/** A file as a version counts it: a link as where it points, never what it points at, which is outside the folder and no write goes through. */
function readForVersion(file: string): string | { unreadable: string } | { link: string } {
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) return { link: fs.readlinkSync(file) };
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { unreadable: (err as Error).message };
  }
}

/** Every file under a skill's folder, by its path in the folder, sorted, each as a version counts it. */
function folderForVersion(dir: string): Array<[string, unknown]> {
  let entries: string[];
  try {
    entries = (fs.readdirSync(dir, { recursive: true }) as string[]).sort();
  } catch (err) {
    return [['', { unreadable: (err as Error).message }]];
  }
  return entries.flatMap((entry) => {
    const at = path.join(dir, entry);
    const stat = fs.lstatSync(at, { throwIfNoEntry: false });
    return stat?.isDirectory() ? [] : [[entry, readForVersion(at)] as [string, unknown]];
  });
}

/** The skills an agent's text gives by name, as `parseAgent` reads its `skills:` line — none for a line that names a card file, which it refuses. */
export function skillNamesIn(text: string): string[] {
  const line = frontmatterKey(text, 'skills');
  if (line === undefined || isCardFile(line)) return [];
  return line
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * What an agent's card says it can do (`agentCard`): an entry for each skill its `skills:` gives, in that order, read off the skill's SKILL.md
 * (`skillEntryOf`) where `found` finds it — or, for an agent given none, one entry made from its own description (`ownSkill`). Never a list
 * written by hand, so the card cannot say what the skills do not.
 *
 * Refused, naming the fix: a skill found nowhere or that cannot be used, in `skillAt`'s words for the agent, and a SKILL.md whose frontmatter
 * the card cannot read. The card only describes — no run reads it — so nothing refuses a load or a run for it: it is refused where a card is
 * asked for (`wf agents card`, the api's card route) and said on the board's agent page. `found` is where a start finds skills (`skillsFor`,
 * with the places), or a card could name a skill the run would not be given.
 */
export function cardSkills(agent: Pick<Agent, 'name' | 'description' | 'skills'>, found: SkillsFound): AgentSkill[] {
  if (!agent.skills?.length) return [ownSkill(agent)];
  const named = `${AGENTS_FOLDER}/${agent.name}.md`;
  return agent.skills.map((skill) => {
    const at = found.at.get(skill);
    if (at instanceof WorkflowError) throw new WorkflowError(`${named} gives the skill \`${skill}\`, which cannot be used — ${at.message}`);
    if (at === undefined) {
      throw new WorkflowError(
        `${named} gives the skill \`${skill}\`, and no skills folder has it — looked in ${found.looked.join(', ')}. A skill is a folder holding a SKILL.md: write skills/${skill}/SKILL.md beside ${AGENTS_FOLDER}/, or take \`${skill}\` off the agent's \`skills:\`.`,
      );
    }
    const file = path.join(at, 'SKILL.md');
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new WorkflowError(`${file} cannot be read (${(err as Error).message}), and ${named}'s card is read from it.`);
    }
    return skillEntryOf(file, skill, text);
  });
}

/**
 * Whether a skill asks to be told whole, in the system prompt after the agent's instructions, rather than named for the session to load:
 * its SKILL.md's frontmatter says `preload: true`. Claude Code reads no such key (its own `preload` is inert on a plugin's skill), so
 * the run does it when it renders the agent (`writeAgentFiles`). False for a SKILL.md that cannot be read.
 */
export function preloads(skillDir: string): boolean {
  try {
    const { block } = splitFrontmatter('SKILL.md', fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'));
    return frontmatterKey(`---\n${block ?? ''}---\n`, 'preload') === 'true';
  } catch {
    return false;
  }
}

/**
 * What a workflow is for, in its author's words: the first paragraph of its folder's README, its lines joined into one.
 *
 * Null when the folder has no README, or the README has nothing else (`readmeDescription`, which reads its text). Never throws: a README that cannot be read
 * describes nothing, and the steps beside it are `loadWorkflows`' to judge.
 */
export function workflowDescription(dir: string): string | null {
  let text: string;
  try {
    const readme = fs.readdirSync(dir).filter(isReadme).sort()[0];
    if (!readme) return null;
    text = fs.readFileSync(path.join(dir, readme), 'utf8');
  } catch {
    return null;
  }
  return readmeDescription(text);
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
 * every other key kept.
 */
const StepAgentSchema = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.String,
    keys: Schema.mutable(Schema.Array(Schema.Literals([...STEP_KEYS, 'disallow', 'allow']))),
    body: Schema.String,
    given: Schema.Record(Schema.String, Schema.String),
    instructions: Schema.optionalKey(Schema.String),
    skills: Schema.optionalKey(Strings),
    systemPrompt: Schema.optionalKey(Schema.Literals(SYSTEM_PROMPTS)),
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
  workspace: Schema.optionalKey(Schema.Literals(['main', 'folder'])),
  slot: Schema.optionalKey(Schema.Literal('none')),
  agent: Schema.optionalKey(StepAgentSchema),
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
  output: Schema.optionalKey(Schema.StructWithRest(Schema.Struct({ file: Schema.String, schema: OutputSchemaSchema }), Rest)),
  loop: Schema.optionalKey(Schema.String),
  rounds: Schema.optionalKey(Schema.Finite),
} satisfies FrozenStepFields;

/** A field under each former name of a key (`FORMER_KEYS`), checked as the key it is now: what `asNamed` moves onto that key. */
const formerStepFields = { disallow: frozenStepFields.disallowedTools, allow: frozenStepFields.allowedTools };

/**
 * A step as the run froze it at `wf start`: the parser's output (`Workflow`), each key of `STEP_KEYS`, and each under its former name
 * (`FORMER_KEYS`), checked for the type the parser gives it. It checks the shape, not the vocabulary: a harness, a model or a mode is any
 * text, a count any number, judged when the step is filed, so a word retired since the run started does not lose the run. Every key it
 * does not name is kept, as a record a newer `wf` wrote keeps it. Read under the names its keys have now by `asNamed`.
 */
export const FrozenStepSchema = Schema.StructWithRest(Schema.Struct({ ...frozenStepFields, ...formerStepFields }), Rest);
