/**
 * A folder of markdown is a workflow: its step files (`stepFiles`, a `README.md` left out and read for its description), the names a
 * step and the folders beside it may take, and `parseFolder`, which reads every step and checks them together.
 */
import path from 'node:path';
import { AGENTS_FOLDER, FRONTMATTER, isReadme, SKILLS_FOLDER, type Workflow } from '../step/step.ts';
import { orderSteps, parseWorkflow, validate } from '../workflow/index.ts';
import type { Agents, SkillsFound } from '../agents/agents.ts';

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

/** The files of a folder that are steps: every `.md` but its README, sorted. */
export const stepFiles = (entries: readonly string[]): string[] => entries.filter((f) => f.endsWith('.md') && !isReadme(f)).sort();

/**
 * A folder's steps from the text of their files, `[name, text]` a step, checked as a folder on disk is checked: each step parsed, in the
 * order of its file's name as a folder lists them, then the ways the steps do not form a workflow (`validate`), and in the order they run.
 * Pure: `read` answers for a file beside the steps, and `agents` are those `agent:` may name, as `parseWorkflow`'s are.
 *
 * What `loadWorkflows` reads a folder with, and what `writeWorkflow` checks one with before a byte of it is written: one reading, so a
 * folder written is refused for what a folder read would be, in the same words.
 */
export function parseFolder(
  files: ReadonlyArray<readonly [name: string, text: string]>,
  read?: (file: string) => string | undefined,
  agents?: Agents,
  skills?: SkillsFound,
): Workflow[] {
  const byFile = [...files].sort(([a], [b]) => (`${a}.md` < `${b}.md` ? -1 : `${a}.md` > `${b}.md` ? 1 : 0));
  const steps = byFile.map(([name, text]) => parseWorkflow(name, text, read, agents, skills));
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
