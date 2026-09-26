/**
 * An agent of yours tried on a short brief, from its page (agents card 3c): a hidden one-step folder team of the store's own,
 * `tries/<agent>/try.md`, started as any folder run is — with no repository, in folders the run makes under `runs/<id>/`, and a budget of
 * a dollar. Its step names the agent and fences it: `dontAsk` with `Edit(**)`, whatever the agent's own mode says, so every read outside
 * its folder is denied and nothing it writes lands outside the run. A rehearsal, not the agent's own permissions.
 *
 * The folder is not among the workflows the board lists (`tries/` is no place of them), and a run of it is a try by where it was started
 * from (`tryOf`), read off the record alone: nothing new is written on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from 'agent-orchestrator';
import { AGENTS_FOLDER, SKILLS_FOLDER } from 'agent-orchestrator/workflow';
import type { Run } from 'agent-orchestrator/run';

/** Where every try's folder is: `tries/` in the store, beside `workflows/`. */
export const triesDir = (home: string = HOME): string => path.join(home, 'tries');

/** The folder an agent's try is started from. */
export const tryDir = (name: string, home: string = HOME): string => path.join(triesDir(home), name);

/** The step a try's folder has, and so the one step of its run. */
export const TRY_STEP = 'try';

/** The cap on a try, in dollars: what its step's `budget:` says. */
export const TRY_BUDGET = 1;

/** What the step's frontmatter records the agent's version under: a comment, which the parser skips. */
const VERSION_LINE = '# version ';

/** The try's step file: the agent, the fence and the cap, and the agent's version it was written at. */
export const tryText = (name: string, version: string): string =>
  [
    '---',
    `${VERSION_LINE}${version}`,
    'workspace: folder',
    `agent: ${name}`,
    `budget: ${TRY_BUDGET}`,
    'permissionMode: dontAsk',
    'allowedTools: Edit(**)',
    '---',
    'A rehearsal of the brief: work in this folder, and write what you make here.',
    '',
  ].join('\n');

/**
 * Why an agent's try cannot be started from `tries/<name>`, or null. A try's folder is one level under `tries/`, so `tries/` is its root, where a
 * start looks for `agents/` and `skills/` before the store's (`lookupRoots`): a folder named either is no workflow (`agentsFolderRefusal`), and
 * one agent's try would stand where every other try looks for agents or skills.
 */
export function tryNameRefusal(name: string): string | null {
  if (name !== AGENTS_FOLDER && name !== SKILLS_FOLDER) return null;
  return `An agent named \`${name}\` cannot be tried from the board: its try's folder would be ${tryDir(name)}, where every try looks for its ${name} first, and a folder named \`${name}\` is not a workflow. Rename the agent to try it.`;
}

/**
 * The agent's try folder, written when it is not there or was written at another version of the agent, and left as it is otherwise. A
 * folder or a step file that is a link is refused: written through, it would change whatever it points at.
 */
export function writeTryFolder(name: string, version: string, home: string = HOME): string {
  const dir = tryDir(name, home);
  const file = path.join(dir, `${TRY_STEP}.md`);
  for (const at of [triesDir(home), dir, file]) {
    if (fs.lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw Object.assign(new Error(`${at} is a link, and a try's folder is written by the api: make it a folder of its own, or remove it.`), { exitCode: 2 });
    }
  }
  const text = tryText(name, version);
  let was: string | undefined;
  try { was = fs.readFileSync(file, 'utf8'); } catch { /* not written yet */ }
  if (was === text) return dir;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, text);
  return dir;
}

/** The agent a run tried, when it is a try: started from a folder directly under `tries/`. Null for every other run. */
export function tryOf(run: Pick<Run, 'workflowDir'>, home: string = HOME): { agent: string } | null {
  const dir = path.resolve(run.workflowDir);
  return path.dirname(dir) === path.resolve(triesDir(home)) ? { agent: path.basename(dir) } : null;
}
