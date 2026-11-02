/**
 * A folder of markdown is a workflow: its step files (`stepFiles`, a `README.md` left out and read for its description), the names a
 * step and the folders beside it may take, and `parseFolder`, which reads every step and checks them together.
 */
import path from 'node:path';
import { AGENTS_FOLDER, FRONTMATTER, isReadme, SKILLS_FOLDER, type Workflow } from '../step/step.ts';
import { orderSteps, parseWorkflow, validate, type Hire } from '../workflow/index.ts';
import type { Agents, SkillsFound } from '../agents/agents.ts';
import type { WorkflowDirRefusal } from '../../contracts/workflow-dir.contract.ts';
import type { WorkflowVersionRefusal } from '../../contracts/workflow-version.contract.ts';

/**
 * Why `name` cannot be a step's name, or `undefined` when it can. A step is its file, `<name>.md`, in its workflow's folder, and other
 * steps name it in `after:`, `input:`, `resume:` and `loop:`: so a name is one file's in that folder, not hidden, not the README's, and one
 * a list can hold. What `writeWorkflow` refuses a step with before it writes; a folder read from disk has its names from its files already.
 */
export function stepNameRefusal(name: unknown): string | undefined {
  const fix = 'Name it as its file is named, without .md — implement, say.';
  if (typeof name !== 'string' || !name.trim())
    return `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`;
  const as = `\`${name}\` is not a step's name:`;
  if (/[\\/]/.test(name)) return `${as} a step is a file in its workflow's folder, and a slash names a file in another. ${fix}`;
  // oxlint-disable-next-line no-control-regex -- a name holding a control character is refused, so the class must name them
  if (/[\u0000-\u001f\u007f]/.test(name))
    return `${as} it holds a control character — ${JSON.stringify(name)} — which a line of frontmatter cannot. ${fix}`;
  if (name.startsWith('.'))
    return `${as} a name that starts with a dot is a hidden file, which a person listing the folder does not see. ${fix}`;
  if (name !== name.trim())
    return `${as} \`after:\` trims every name it lists, so no step could wait on it. Write it without the spaces around it.`;
  if (name.includes(',')) return `${as} \`after:\` and \`input:\` split on every comma, so no step could wait on it. ${fix}`;
  if (/\.md$/i.test(name)) return `${as} it is a file's name, and a step is named without its .md: \`${name.slice(0, -3)}\`.`;
  if (isReadme(`${name}.md`))
    return `${as} ${name}.md is the folder's README, which says what the workflow is for and is never read as a step. ${fix}`;
  if (new TextEncoder().encode(`${name}.md`).length > 255) return `${as} ${name}.md is longer than a file's name may be, 255 bytes. ${fix}`;
  return undefined;
}

/** Where the agents a workflow's steps name are: `agents/`, beside the workflow's folder — `workflows/agents` for `workflows/dev`. */
export const agentsDir = (workflowDir: string): string => path.join(path.dirname(path.resolve(workflowDir)), AGENTS_FOLDER);

/** Why `dir` is not a workflow because it is the folder of agents or of skills, or `undefined` for a folder with another name. */
export function agentsFolderRefusal(dir: string): string | undefined {
  if (path.basename(path.resolve(dir)) === SKILLS_FOLDER) {
    return `${dir} is ${SKILLS_FOLDER}/, the folder of the skills the agents beside it give — each folder in it is a skill, not a step, so no workflow has its name. Name a workflow beside it, or give yours another name.`;
  }
  if (path.basename(path.resolve(dir)) !== AGENTS_FOLDER) return undefined;
  return `${dir} is ${AGENTS_FOLDER}/, the folder of the agents the workflows beside it name — its files are agents, not steps, so no workflow has its name. Name a workflow beside it, or give yours another name.`;
}

/**
 * The refusal of a file that is a link, where a folder's files are meant to be its own: `what` says whose, and what following it would do.
 * `writeWorkflow`'s words for a linked step, and `loadAgents`' for a linked agent.
 */
export const linkRefusal = (file: string, what: string): string =>
  `${file} is a link, and ${what} Replace the link with a file of its own — remove the link and copy what it pointed at into its place, rm <file> && cp <target> <file> — or take it out of the folder.`;

/**
 * Why removing the workflow at `dir` would leave something unable to go on, one sentence per thing that still needs it, each naming the
 * command that frees it: a run that froze no steps at its start and reads them from the folder (`run`), a card queued to start on it
 * (`card`), and a factory that offers its name with nothing else to give under it, with its hires into it (`factory`).
 */
export const stillNeeded = {
  run: (id: string, dir: string): string =>
    `run ${id} froze no workflow at its start and reads its steps from ${dir}: nemia rm ${id} forgets it.`,
  card: (name: string, dir: string): string =>
    `card ${name} is queued to start on ${dir}: nemia inbox queue ${name} --off takes it back, and nemia inbox queue ${name} --workflow <w> then queues it on another.`,
  factory: (factory: string, name: string, hires: readonly string[]): string =>
    `factory ${factory} offers ${name}, and none of its repositories has a workflow of that name: ${[
      ...hires.map((step) => `nemia factory fire ${factory} --step ${step}`),
      `nemia factory detach ${factory} ${name}`,
    ].join(', then ')}.`,
};

/** What a refusal of a write over something there adds: the version it is at, which a write given it changes; nothing for none. */
export const takenAt = (version: string | null): string =>
  version === null ? '' : `: it is at version ${version}, and a write given that version changes it`;

/**
 * Why a write or a removal (`does`) of the workflow folder `dir` given the version `version` it was read at does nothing: the folder is at
 * `now` since (`workflowVersion`), so a step, the README or a schema there changed, and what it holds would go unseen.
 */
export const workflowStale = {
  write: (dir: string, version: string, now: string): string =>
    `${dir} has changed since it was read at version ${version}: a step, the README or a schema there was edited, added or removed, and this save would write over it. Nothing was written. Read the folder again (it is at version ${now}), make the change on what it holds now, and save that.`,
  remove: (dir: string, version: string, now: string): string =>
    `${dir} has changed since it was read at version ${version}: a step, the README or a schema there was edited, added or removed, and removing it now would remove what was not seen. Nothing was removed. Read the folder again (it is at version ${now}), and remove it as it is now.`,
};

/**
 * Why a new workflow is not written to `dir`, which is there already: a workflow at version `version`, which a write given it changes, or
 * a file that is no workflow (`version` null).
 */
export const workflowTaken = (dir: string, version: string | null): string =>
  version === null
    ? `${dir} is there, and is not a workflow: a workflow is a folder of steps. Name the workflow otherwise.`
    : `${dir} is a workflow already, at version ${version}: a write given that version changes it. Give the new one another name, or write this one with that version.`;

/** Why the workflow at `dir` is not removed while `users` need it (`stillNeeded`): each of them, and that nothing was removed. */
export const workflowInUse = (dir: string, users: readonly string[]): string =>
  `${dir} is still needed: ${users.join(' ')} Nothing was removed.`;

/** Why a workflow written to `dir` with no steps is refused: a workflow has one at least. */
export const noStepsRefusal = (dir: string): string =>
  `no steps to write to ${dir}, and a workflow has at least one. To remove the workflow, remove its folder.`;

/** Why a workflow with two steps named `name` is refused: a step is its file. */
export const twiceRefusal = (name: string): string =>
  `two steps are named ${name}, and a step is its file, ${name}.md. Rename one of them.`;

/** The files of a folder that are steps: every `.md` but its README, sorted. */
export const stepFiles = (entries: readonly string[]): string[] => entries.filter((f) => f.endsWith('.md') && !isReadme(f)).sort();

/**
 * What a factory gives one workflow's steps: the agents it hires into them — the factory's name, the workflow's (its folder's name, as a
 * hire names it) and the agent each step is hired, by step — and its rules, the words every step with an agent is told (`rules`), none
 * when it keeps none.
 */
export type Fills = { factory: string; workflow: string; agents: Readonly<Record<string, string>>; rules?: string };

/**
 * The agents a workflow's steps may name and the skills they may be given, found where a run of the folder looks: what its steps are
 * parsed against (`parseFolder`), found by the Agent and Skill doors (`agents.found`, `skills.found`) or, for a synchronous reader, by
 * `foundAt` (`folder.store.ts`).
 */
export type Found = { readonly agents: Agents; readonly skills: SkillsFound };

/** The hire `fills` makes into the step `step`, or undefined for none. */
function hireOf(fills: Fills | undefined, step: string): Hire | undefined {
  if (!fills || !Object.hasOwn(fills.agents, step)) return undefined;
  const agent = fills.agents[step];
  if (agent === undefined) return undefined;
  return { agent, factory: fills.factory, step: `${fills.workflow}/${step}` };
}

/**
 * A folder's steps from the text of their files, `[name, text]` a step, checked as a folder on disk is checked: each step parsed, in the
 * order of its file's name as a folder lists them, then the ways the steps do not form a workflow (`validate`), and in the order they run.
 * Pure: `read` answers for a file beside the steps, and `agents` are those `agent:` may name, as `parseWorkflow`'s are. `fills` are the
 * agents a factory hires into the steps (`Fills`), each handed to its step as `parseWorkflow`'s `hired`, and its rules, handed to every
 * step.
 *
 * What `loadWorkflows` reads a folder with, and what `writeWorkflow` checks one with before a byte of it is written: one reading, so a
 * folder written is refused for what a folder read would be, in the same words.
 */
export function parseFolder(
  files: ReadonlyArray<readonly [name: string, text: string]>,
  read?: (file: string) => string | undefined,
  agents?: Agents,
  skills?: SkillsFound,
  fills?: Fills,
): Workflow[] {
  const byFile = [...files].sort(([a], [b]) => (`${a}.md` < `${b}.md` ? -1 : `${a}.md` > `${b}.md` ? 1 : 0));
  const steps = byFile.map(([name, text]) => parseWorkflow(name, text, read, agents, skills, hireOf(fills, name), fills?.rules));
  validate(steps);
  return orderSteps(steps);
}

/**
 * What a workflow is for, in its author's words, from the text of its folder's README: the first paragraph, its lines joined into one.
 *
 * A heading is the README's title, not a paragraph, and a frontmatter block is not prose, so both are passed over. Null when the README has
 * nothing else. Pure: `workflowDescription` (`folder.store.ts`) reads the README and asks this.
 */
export function readmeDescription(text: string): string | null {
  text = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(FRONTMATTER, '');
  for (const block of text.split(/\n[ \t]*\n/)) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^#{1,6}(\s|$)/.test(line));
    if (lines.length) return lines.join(' ');
  }
  return null;
}

/** What is at a workflow's folder before a write or a removal: nothing, a file, or a folder at its version (`workflowVersion`). */
export type WorkflowThere = { kind: 'none' } | { kind: 'file' } | { kind: 'folder'; version: string };

/** A refusal of a workflow's write or removal: the kind the api answers it with, and its words. */
export type VersionRefused = { kind: 'Invalid' | 'Conflict' | 'Missing'; message: string };

/**
 * Why `dir` cannot be a workflow's folder as the Workflow door is addressed by it (`WorkflowDir`), or null where it can: absolute and
 * normalized as `path.resolve` leaves it, so one folder has one id, not the root, and not the folder of agents or of skills beside the
 * workflows (`agentsFolderRefusal`). Pure, and proved by `contracts/workflow-dir.contract.ts`.
 */
export const workflowDirRefusal: WorkflowDirRefusal = (dir) => {
  const fix = 'Name the folder as `workflowFolder` resolves it: an absolute path, as path.resolve leaves it.';
  if (!dir.startsWith('/')) return `${JSON.stringify(dir)} is not a workflow's folder: it is not absolute. ${fix}`;
  if (
    dir.includes('//') ||
    dir.includes('/./') ||
    dir.includes('/../') ||
    dir.endsWith('/.') ||
    dir.endsWith('/..') ||
    (dir.length > 1 && dir.endsWith('/'))
  )
    return `${JSON.stringify(dir)} is not a workflow's folder: resolving it would change it. ${fix}`;
  if (dir === '/') return `/ is not a workflow's folder: a workflow is a folder with a name. ${fix}`;
  if (dir === AGENTS_FOLDER || dir.endsWith('/' + AGENTS_FOLDER) || dir === SKILLS_FOLDER || dir.endsWith('/' + SKILLS_FOLDER))
    return `${dir} is the folder of the agents or the skills beside the workflows, not a workflow. Name a workflow beside it.`;
  return null;
};

/**
 * Why a write or a removal (`does`) of the workflow folder `dir`, given the version `given` it was read at, does nothing, judged against
 * what is there now (`there`), or null where it goes on: a new write over nothing goes; a write given a version where nothing is now is
 * `Missing`; a write over a file, or over a folder with no version, a `Conflict` (`workflowTaken`); a removal of a folder with no
 * version `Invalid`; and an act given a version the folder is no longer at a `Conflict` (`workflowStale`). A removal where no folder is
 * goes on, to the remover's own refusal. Pure, and proved by `contracts/workflow-version.contract.ts`.
 */
export const workflowVersionRefusal: WorkflowVersionRefusal = (dir, does, there, given) => {
  if (there.kind === 'none') {
    if (does === 'write' && given !== undefined)
      return {
        kind: 'Missing',
        message: `${dir} is not there: it was removed since it was read. Write it with no version to make it again.`,
      };
    return null;
  }
  if (there.kind === 'file') return does === 'write' ? { kind: 'Conflict', message: workflowTaken(dir, null) } : null;
  if (given === undefined) {
    if (does === 'write') return { kind: 'Conflict', message: workflowTaken(dir, there.version) };
    return {
      kind: 'Invalid',
      message: `${dir} is at version ${there.version}, and a removal is checked against the version it was read at, so a folder changed since is not removed unseen. Give that version to remove it.`,
    };
  }
  if (given !== there.version) return { kind: 'Conflict', message: workflowStale[does](dir, given, there.version) };
  return null;
};
