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
import { AGENTS_FOLDER, agentsDir, agentsFolderRefusal, formerKeyLine, formerKeysIn, frontmatterKey, isReadme, linkRefusal, parseAgent, parseFolder, readmeDescription, stepFiles, WorkflowError, type Agent, type Workflow } from './workflow.ts';

/**
 * Read a folder of steps and check that they form a workflow rather than a wish. A `README.md` in the folder
 * describes the workflow (`workflowDescription`) and is not a step. The steps come back in the order they run
 * (`orderSteps`), not the folder's, each resolved against the agent it names (`agentsDir`).
 */
export function loadWorkflows(dir: string): Workflow[] {
  if (!fs.existsSync(dir)) throw new WorkflowError(`no workflow folder at ${dir}`);
  const agents = agentsFolderRefusal(dir);
  if (agents) throw new WorkflowError(agents);
  const entries = fs.readdirSync(dir);
  const files = stepFiles(entries);
  if (!files.length) throw new WorkflowError(`${dir} has no .md steps in it${noStepsBecause(dir, entries)}`);

  const read = (file: string): string | undefined => {
    try { return fs.readFileSync(path.resolve(dir, file), 'utf8'); } catch { return undefined; }
  };
  return parseFolder(files.map((f) => [path.basename(f, '.md'), fs.readFileSync(path.join(dir, f), 'utf8')]), read, loadAgents(agentsDir(dir)));
}

/**
 * A line for each file of the workflow in `dir` that still writes a key under its former name (`formerKeyLine`): its step files, then each
 * agent a step names, once. What `wf start` prints after it has started the run, which the former names do not stop. None for a folder that
 * is not there, and a file that cannot be read says nothing here: the load has said why.
 */
export function formerKeyLines(dir: string): string[] {
  const read = (at: string): string => {
    try { return fs.readFileSync(at, 'utf8'); } catch { return ''; }
  };
  let files: string[];
  try { files = stepFiles(fs.readdirSync(dir)); } catch { return []; }
  const steps = files.map((file) => [file, read(path.join(dir, file))] as const);
  const agents = [...new Set(steps.flatMap(([, text]) => frontmatterKey(text, 'agent') ?? []))].sort();
  return [
    ...steps.flatMap(([file, text]) => formerKeysIn(text).map((former) => formerKeyLine(path.join(dir, file), former))),
    ...agents.flatMap((agent) => {
      const at = path.join(agentsDir(dir), `${agent}.md`);
      return formerKeysIn(read(at)).map((former) => formerKeyLine(at, former));
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
    ? ` — it holds workflows, each a folder of steps: ${workflows.join(', ')}. Name one of them: ${path.join(dir, workflows[0]!)}.`
    : '';
}

/** The folders in `dir` that hold steps, sorted: the workflows a folder of workflows has. None for a folder that is not there. */
export function workflowsIn(dir: string, entries?: readonly string[]): string[] {
  let names: readonly string[];
  try { names = entries ?? fs.readdirSync(dir); } catch { return []; }
  return names.filter((name) => {
    if (name === AGENTS_FOLDER) return false;
    try {
      return stepFiles(fs.readdirSync(path.join(dir, name))).length > 0;
    } catch {
      return false;
    }
  }).sort();
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
  throw new WorkflowError(`no workflow folder at ${at}${bare ? `, nor a workflow named ${given} in ${workflows}` : ''}. `
    + (theirs.length
      ? `The repository's workflows are: ${theirs.join(', ')} — name one, or give the path to a workflow folder.`
      : `Give the path to a workflow folder, or the name of a folder of steps under ${workflows}.`));
}

/**
 * The agents in `dir` — a workflow's are in `agentsDir(<workflow>)` — by name: every `.md` but a README, each read (`parseAgent`) or the
 * refusal of it, which is thrown only at a step that names it, so a broken agent stops no workflow that does not use it. A file that is a
 * link is refused by name: an agent's file is its own, as a step's is. None for a folder that is not there.
 */
export function loadAgents(dir: string): Map<string, Agent | WorkflowError> {
  const agents = new Map<string, Agent | WorkflowError>();
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return agents; }
  const read = (file: string): string | undefined => {
    try { return fs.readFileSync(path.resolve(dir, file), 'utf8'); } catch { return undefined; }
  };
  for (const file of stepFiles(entries.map((e) => e.name))) {
    const name = path.basename(file, '.md');
    const at = path.join(dir, file);
    try {
      if (entries.find((e) => e.name === file)!.isSymbolicLink()) {
        throw new WorkflowError(linkRefusal(at, `an agent's file is its own: read through a link, what every step naming ${AGENTS_FOLDER}/${file} is told would be whatever the link points at, outside the folder, and would change with it.`));
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
      try { text = fs.readFileSync(path.join(dir, file), 'utf8'); } catch { continue; }
      if (frontmatterKey(text, 'agent') === name) users.push(`${workflow}/${path.basename(file, '.md')}`);
    }
  }
  return users.sort();
}

/**
 * What an agent's files hold, as one word, or `null` for an agent that is not there: a digest of `<name>.md` and of each file it names beside
 * it — the skills its `skills:` names and the schema its `output:` names — each by name with what it holds, so a file that cannot be read
 * counts as what it says. A write of the agent carries it, and is refused when the agent no longer holds it (`writeAgent`), rather than
 * written over what changed since it was read. A second sidecar has a second version function to keep right, the api's `versionOf`.
 */
export function agentVersion(dir: string, name: string): string | null {
  const at = path.join(dir, `${name}.md`);
  if (!fs.lstatSync(at, { throwIfNoEntry: false })) return null;
  // A link counts as where it points, never as what it points at: that is outside the folder, and no write of the agent goes through it.
  const read = (file: string): string | { unreadable: string } | { link: string } => {
    if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) return { link: fs.readlinkSync(file) };
    try { return fs.readFileSync(file, 'utf8'); } catch (err) { return { unreadable: (err as Error).message }; }
  };
  const text = read(at);
  // Every file the agent names beside it, in the order `renderAgent` writes the keys: what it can do, and what its steps declare.
  const beside = typeof text === 'string' ? (['skills', 'output'] as const).flatMap((key) => frontmatterKey(text, key) ?? []) : [];
  const files = [[`${name}.md`, text], ...beside.map((file) => [file, read(path.resolve(dir, file))])];
  return createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
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
