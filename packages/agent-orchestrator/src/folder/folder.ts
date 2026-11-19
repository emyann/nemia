/**
 * A folder of markdown is a workflow: its step files (`stepFiles`, a `README.md` left out and read for its description), the names a
 * step and the folders beside it may take, and `parseFolder`, which reads every step and checks them together.
 */
import path from 'node:path';
import { AGENTS_FOLDER, CARRIED_FOLDER, FRONTMATTER, isReadme, SKILLS_FOLDER, type StepSpec } from '../step/step.ts';
import { orderSteps, parseWorkflow, validate } from '../workflow/index.ts';
import type { Agents, SkillsFound } from '../agents/agents.ts';
import type { WorkflowDirRefusal } from '../../contracts/workflow-dir.contract.ts';
import type { WorkflowVersionRefusal } from '../../contracts/workflow-version.contract.ts';
import type { ReadmeWrittenOf } from '../../contracts/readme-written.contract.ts';

export type { WorkflowThere, VersionRefused } from '../../contracts/workflow-version.contract.ts';

/**
 * Why `name` cannot be a step's name, or `undefined` when it can. A step is its file, `<name>.md`, in its workflow's folder, and other
 * steps name it in `after:`, `input:`, `resume:` and `loop:`: so a name is one file's in that folder, not hidden, not the README's, and one
 * a list can hold. What `writeWorkflow` refuses a step with before it writes; a folder read from disk has its names from its files already.
 * @param name The name asked for, as given: anything, since a writer's draft is not typed.
 */
export function stepNameRefusal(name: unknown) {
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

/**
 * Where the agents a workflow's steps name are: `agents/`, beside the workflow's folder — `workflows/agents` for `workflows/dev`.
 * @param workflowDir The workflow's folder.
 */
export const agentsDir = (workflowDir: string) => path.join(path.dirname(path.resolve(workflowDir)), AGENTS_FOLDER);

/**
 * Why `dir` is not a workflow because it is the folder of agents, of skills or of carried files, or `undefined` for one with another
 * name.
 * @param dir The folder named as a workflow.
 */
export function agentsFolderRefusal(dir: string) {
  if (path.basename(path.resolve(dir)) === CARRIED_FOLDER) {
    return `${dir} is ${CARRIED_FOLDER}/, the folder of the files the workflows beside it share — a run freezes it beside its workflow's folder, so no workflow has its name. Name a workflow beside it, or give yours another name.`;
  }
  if (path.basename(path.resolve(dir)) === SKILLS_FOLDER) {
    return `${dir} is ${SKILLS_FOLDER}/, the folder of the skills the agents beside it give — each folder in it is a skill, not a step, so no workflow has its name. Name a workflow beside it, or give yours another name.`;
  }
  if (path.basename(path.resolve(dir)) !== AGENTS_FOLDER) return undefined;
  return `${dir} is ${AGENTS_FOLDER}/, the folder of the agents the workflows beside it name — its files are agents, not steps, so no workflow has its name. Name a workflow beside it, or give yours another name.`;
}

/**
 * The refusal of a file that is a link, where a folder's files are meant to be its own: `what` says whose, and what following it would do.
 * `writeWorkflow`'s words for a linked step, and `loadAgents`' for a linked agent.
 * @param file The path of the file that is a link.
 * @param what Whose the file is and what following the link would do, as the rest of a sentence.
 */
export const linkRefusal = (file: string, what: string) =>
  `${file} is a link, and ${what} Replace the link with a file of its own — remove the link and copy what it pointed at into its place, rm <file> && cp <target> <file> — or take it out of the folder.`;

/**
 * Why removing the workflow at `dir` would leave something unable to go on, one sentence per thing that still needs it, each naming the
 * command that frees it: a run that froze no steps at its start and reads them from the folder (`run`), a card queued to start on it
 * (`card`), and a factory that offers its name with nothing else to give under it, with its hires into it (`factory`).
 */
export const stillNeeded = {
  run: (id: string, dir: string) => `run ${id} froze no workflow at its start and reads its steps from ${dir}: nemia rm ${id} forgets it.`,
  card: (name: string, dir: string) =>
    `card ${name} is queued to start on ${dir}: nemia inbox queue ${name} --off takes it back, and nemia inbox queue ${name} --workflow <w> then queues it on another.`,
  factory: (factory: string, name: string, hires: readonly string[]) =>
    `factory ${factory} offers ${name}, and none of its repositories has a workflow of that name: ${[
      ...hires.map((step) => `nemia factory fire ${factory} --step ${step}`),
      `nemia factory detach ${factory} ${name}`,
    ].join(', then ')}.`,
};

/**
 * What a refusal of a write over something there adds: the version it is at, which a write given it changes; nothing for none.
 * @param version The version of what is there, or null where it has none.
 */
export const takenAt = (version: string | null) =>
  version === null ? '' : `: it is at version ${version}, and a write given that version changes it`;

/**
 * Why a write or a removal (`does`) of the workflow folder `dir` given the version `version` it was read at does nothing: the folder is at
 * `now` since (`workflowVersion`), so a step, the README or another of its files there changed, and what it holds would go unseen.
 */
export const workflowStale = {
  write: (dir: string, version: string, now: string) =>
    `${dir} has changed since it was read at version ${version}: a step, the README or another of its files there was edited, added or removed, and this save would write over it. Nothing was written. Read the folder again (it is at version ${now}), make the change on what it holds now, and save that.`,
  remove: (dir: string, version: string, now: string) =>
    `${dir} has changed since it was read at version ${version}: a step, the README or another of its files there was edited, added or removed, and removing it now would remove what was not seen. Nothing was removed. Read the folder again (it is at version ${now}), and remove it as it is now.`,
};

/**
 * Why a new workflow is not written to `dir`, which is there already: a workflow at version `version`, which a write given it changes, or
 * a file that is no workflow (`version` null).
 * @param dir The folder written to.
 * @param version The version of the workflow there, or null for a file that is no workflow.
 */
export const workflowTaken = (dir: string, version: string | null) =>
  version === null
    ? `${dir} is there, and is not a workflow: a workflow is a folder of steps. Name the workflow otherwise.`
    : `${dir} is a workflow already, at version ${version}: a write given that version changes it. Give the new one another name, or write this one with that version.`;

/**
 * Why the workflow at `dir` is not removed while `users` need it (`stillNeeded`): each of them, and that nothing was removed.
 * @param dir The workflow's folder.
 * @param users One sentence for each thing that still needs it, each naming the command that frees it.
 */
export const workflowInUse = (dir: string, users: readonly string[]) => `${dir} is still needed: ${users.join(' ')} Nothing was removed.`;

/**
 * Why a workflow written to `dir` with no steps is refused: a workflow has one at least.
 * @param dir The folder written to.
 */
export const noStepsRefusal = (dir: string) =>
  `no steps to write to ${dir}, and a workflow has at least one. To remove the workflow, remove its folder.`;

/**
 * Why a workflow with two steps named `name` is refused: a step is its file.
 * @param name The name two steps share.
 */
export const twiceRefusal = (name: string) => `two steps are named ${name}, and a step is its file, ${name}.md. Rename one of them.`;

/**
 * The files of a folder that are steps: every `.md` but its README, sorted.
 * @param entries The names the folder holds.
 */
export const stepFiles = (entries: readonly string[]) => entries.filter((f) => f.endsWith('.md') && !isReadme(f)).sort();

/**
 * What a factory gives one workflow's steps: the agents it hires into them — the factory's name, the workflow's (its folder's name, as a
 * hire names it) and the agent each step is hired, by step — and its rules, the words every step with an agent is told (`rules`), none
 * when it keeps none.
 */
export type Fills = { factory: string; workflow: string; agents: Readonly<Record<string, string>>; rules?: string };

/**
 * The agents a workflow's steps may name and the skills they may be given, found where a run of the folder looks: what its steps are
 * parsed against (`parseFolder`), found by the Agent and Skill doors (`agents.found`, `skills.found`), or by their files layers for a
 * synchronous reader (`loadWorkflows`, `workflows.store.ts`).
 */
export type Found = { readonly agents: Agents; readonly skills: SkillsFound };

/**
 * The step `name` rendered as `text`, without its `agent:` line where it names the very agent `fills` hires into it: a draft read with
 * its factory's hires is resolved with the hired agent, and a step whose own file named it too would be refused as hired twice
 * (`attachedAgent`), so the line can only be the hire's. Any other step as it is.
 * @param name The step's name.
 * @param text The step's file, as written.
 * @param fills What a factory gives the workflow's steps, or undefined where none gives any.
 */
export function hiredLineOut(name: string, text: string, fills: Fills | undefined) {
  const hire = hireOf(fills, name);
  if (hire === undefined) return text;
  const end = text.startsWith('---\n') ? text.indexOf('\n---\n', 3) : -1;
  if (end < 0) return text;
  const lines = text.slice(4, end + 1).split('\n');
  const kept = lines.filter((line) => line !== `agent: ${hire.agent}`);
  if (kept.length === lines.length) return text;
  return `---\n${kept.join('\n')}${text.slice(end + 1)}`;
}

/**
 * The hire `fills` makes into the step `step`, or undefined for none.
 * @param fills What a factory gives the workflow's steps, or undefined where none gives any.
 * @param step The step's name.
 */
export function hireOf(fills: Fills | undefined, step: string) {
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
 * @param files Each step's name and the text of its file.
 * @param read The text of a file beside the steps by its path, or undefined where it cannot be read; none where not given.
 * @param agents The agents `agent:` may name; none where not given.
 * @param skills The skills those agents may be given; none where not given.
 * @param fills The agents a factory hires into the steps and its rules; none where not given.
 */
export function parseFolder(
  files: ReadonlyArray<readonly [name: string, text: string]>,
  read?: (file: string) => string | undefined,
  agents?: Agents,
  skills?: SkillsFound,
  fills?: Fills,
) {
  const byFile = [...files].sort(([a], [b]) => (`${a}.md` < `${b}.md` ? -1 : `${a}.md` > `${b}.md` ? 1 : 0));
  const steps = byFile.map(([name, text]) => parseWorkflow(name, text, read, agents, skills, hireOf(fills, name), fills?.rules));
  validate(steps);
  return orderSteps(steps) satisfies StepSpec[];
}

/**
 * What a workflow is for, in its author's words, from the text of its folder's README: the first paragraph, its lines joined into one.
 *
 * A heading is the README's title, not a paragraph, and a frontmatter block is not prose, so both are passed over. Null when the README has
 * nothing else. Pure: `workflowDescription` (`folder.store.ts`) reads the README and asks this.
 * @param text The README's text.
 */
export function readmeDescription(text: string) {
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

/**
 * Why `dir` cannot be a workflow's folder as the Workflow door is addressed by it (`WorkflowDir`), or null where it can: absolute and
 * normalized as `path.resolve` leaves it, so one folder has one id, not the root, and not the folder of agents or of skills beside the
 * workflows (`agentsFolderRefusal`). Pure, and proved by `contracts/workflow-dir.contract.ts`.
 * @param dir The folder's path.
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
  if (
    dir === AGENTS_FOLDER ||
    dir.endsWith('/' + AGENTS_FOLDER) ||
    dir === SKILLS_FOLDER ||
    dir.endsWith('/' + SKILLS_FOLDER) ||
    dir === CARRIED_FOLDER ||
    dir.endsWith('/' + CARRIED_FOLDER)
  )
    return `${dir} is the folder of the agents, the skills or the carried files beside the workflows, not a workflow. Name a workflow beside it.`;
  return null;
};

/**
 * Why a write or a removal (`does`) of the workflow folder `dir`, given the version `given` it was read at, does nothing, judged against
 * what is there now (`there`), or null where it goes on: a new write over nothing goes; a write given a version where nothing is now is
 * `Missing`; a write over a file, or over a folder with no version, a `Conflict` (`workflowTaken`); a removal of a folder with no
 * version `Invalid`; and an act given a version the folder is no longer at a `Conflict` (`workflowStale`). A removal where no folder is
 * goes on, to the remover's own refusal. Pure, and proved by `contracts/workflow-version.contract.ts`.
 * @param dir The workflow's folder.
 * @param does What is asked of it: a write or a removal.
 * @param there What is at the folder now: nothing, a file, or a folder at its version.
 * @param given The version the folder was read at, or undefined where none was given.
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

/**
 * Whether a file's name is markdown, in any case, as the README (`isReadme`) and a draft's carried names (`carriedNameRefusal`) are
 * judged: a Workflow's spec carries markdown as its steps and its README, never among the folder's other files, and a whole write never
 * removes it.
 * @param name The file's name.
 */
export const isMarkdown = (name: string) => name.toLowerCase().endsWith('.md');

/**
 * A file's bytes as text a person can read, or null where they are not text (a NUL, or not UTF-8). A Workflow's spec carries the text
 * files of its folder (`spec.files`), and a write given them leaves every other file alone.
 * @param bytes The file's bytes.
 */
export function textIn(bytes: Uint8Array) {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The README a write of a workflow writes (`readme-written`): none where none is given; a README given with a frontmatter of its own,
 * exactly as given; one given without, its instruction under `diskBlock`, the frontmatter the README on disk opens with.
 * @param diskBlock The frontmatter block the README on disk opens with, its fences included; empty where it opens with none.
 * @param given The README given to the write, and whether it opens with a frontmatter of its own; undefined for none.
 */
export const readmeWritten: ReadmeWrittenOf = (diskBlock, given) => {
  if (given === undefined) return undefined;
  return given.ownFrontmatter ? given.text : diskBlock + given.text;
};

/**
 * The README a write of a workflow writes over `onDisk`, the README it has (`readmeWritten`): `body` as given where it opens with a
 * frontmatter of its own, so a README read and proposed back is written byte for byte; otherwise `body` as the instruction, under the
 * frontmatter `onDisk` opens with. Undefined where no `body` is given: the README is then left as it is. Pure: one rule for a write
 * (`workflowSpecReadme`) and for the spec a proposal will hold once written (`mergedSpec`).
 * @param onDisk The README the folder has now, frontmatter and all; empty where it has none.
 * @param body The README to write, whole or its instruction alone, or undefined to keep `onDisk`.
 */
export function readmeComposed(onDisk: string, body: string | undefined) {
  const ownFrontmatter = body !== undefined && FRONTMATTER.test(body.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
  const diskBlock = FRONTMATTER.exec(onDisk.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'))?.[0] ?? '';
  return readmeWritten(diskBlock, body === undefined ? undefined : { text: body, ownFrontmatter });
}
