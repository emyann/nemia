/**
 * A workflow folder written from its steps (`writeWorkflow`), what the board's builder saves, and one of yours removed whole
 * (`removeWorkflow`); where a folder's runs look for agents and skills (`placesAroundAt`); and whether a folder holds the workflows
 * the board lists (`isWorkflowsHolderAt`). A store beside `folder.store.ts`, reading through the agents and skills reads: it imports
 * neither the engine nor a controller. A run that froze its folder at `nemia start` is changed by none of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { isReadme, WorkflowError, type Workflow } from '../step/step.ts';
import { codexModeWritten } from '../former/former.ts';
import { agentDeniesOf, parseWorkflow, renderStep, type StepDraft } from '../workflow/index.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { agentsFolderRefusal, linkRefusal, noStepsRefusal, parseFolder, stepNameRefusal, twiceRefusal, workflowInUse } from './folder.ts';
import type { Agents } from '../agents/agents.ts';
import type { Places } from '../skills/read.store.ts';
import { foundAt } from './folder.store.ts';
import type { Found } from './folder.ts';
import { HOME, isDirectory } from '../record/record.store.ts';
import { readFactoriesAt } from '../factory/factory.store.ts';

/**
 * What `writeWorkflow` did: the folder, its steps as they now read, and its files by name — written, left as they were because they already
 * read so, and removed.
 */
export type WorkflowWritten = { dir: string; steps: Workflow[]; written: string[]; kept: string[]; removed: string[] };

/**
 * A workflow folder written from its steps: what the board's builder saves, and the inverse of `loadWorkflows`.
 *
 * Judged whole before a byte is written, so a folder refused is the folder it was: where it is (`workflowPlaceRefusal`), each step's name
 * as a file's (`stepNameRefusal`), no name twice, each step rendered (`renderStep`), and then the folder as it would be, parsed in memory
 * as `loadWorkflows` parses one on disk (`parseFolder`), with the schemas its `output:` lines name read from the folder as they are. So
 * every refusal the parser has surfaces here, in its words and naming the step: a key a step does not have, `after:` naming no step, a
 * cycle, a `loop:` that is not a back edge, an `output:` naming a schema that is not in the folder. What `nemia start` refuses beyond the
 * parser — a step named for another's check, `remote: true` off `claude` — is still `nemia start`'s to refuse, as for a folder written by
 * hand. A draft naming its agent writes its own denies alone (`ownLine`): a step's `disallowedTools:` adds to its agent's.
 *
 * Then the `.md` of each step not in the set is removed, before a byte is written: on a filesystem that does not tell case apart —
 * macOS's, Windows's — `Plan.md` and `plan.md` are one file, and a step renamed by case would otherwise be written and then removed under
 * its old name, which is the same file. After that each step's `<name>.md` is written, but for one whose file already reads as the step,
 * which is left as it is, comments and all, since a render has none. A `*.schema.json` is left as it is: a step names one, and the builder
 * writes none. The README is written only when `readme` is given, to the name the folder's README already has.
 *
 * A `.md` in the folder that is a link is refused by name, before any of it: a write follows a link, so a step would be rendered into
 * whatever it points at, outside the folder, and a link is not a file the write removes, so it would be left behind where its step went. A
 * linked README is refused only when a `readme` is given, since that is when it would be written.
 *
 * A draft on codex by its agent's `harness:` alone that sends its sandbox as `permissionMode` is refused (`codexModeWritten`), as
 * `renderStep` refuses one that says `harness: codex`: it would be written under the former name, which the parser still reads.
 *
 * Where: a workflow in the store's `workflows/` or in that of a repository the store knows, a factory's or the `repo` of `places`
 * (`isWorkflowsHolderAt`), the two places the board lists workflows from. Anywhere else only with `{ anywhere: true }`, since a write
 * removes files, and a path mistyped would remove them from a folder that is not a workflow; `places.repo` names a repository the store
 * does not know. Its steps are resolved against the agents and skills `found` where a run of it would look (`lookupRoots`): in `places`,
 * or else the factory's repository its folder is in and the store (`placesAroundAt`), which the Workflow door finds through the Agent and
 * Skill doors. A run is not changed by any of it: it froze its folder at `nemia start`.
 */
export function writeWorkflowAt(
  home: string,
  dir: string,
  steps: readonly StepDraft[],
  readme: string | undefined,
  { anywhere = false, places, found }: { anywhere?: boolean; places?: Places; found: Found },
): WorkflowWritten {
  const at = path.resolve(dir);
  const refuse = (why: string | undefined) => {
    if (why) throw new WorkflowError(why);
  };
  refuse(agentsFolderRefusal(at));
  if (!anywhere) refuse(workflowPlaceRefusal(home, at, places?.repo));
  if (fs.existsSync(at) && !isDirectory(at))
    refuse(`${at} is a file, and a workflow is a folder of steps. Name a folder — one that is not there yet is made.`);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(at, { withFileTypes: true });
  } catch {}
  const linked = entries.find((e) => e.isSymbolicLink() && e.name.endsWith('.md') && (readme !== undefined || !isReadme(e.name)));
  if (linked) {
    refuse(
      linkRefusal(
        path.join(at, linked.name),
        "a workflow's files are its own. Writing this workflow would follow it and write into whatever it points at, outside the folder, and would not remove it when its step goes.",
      ),
    );
  }
  if (!steps.length) refuse(noStepsRefusal(at));
  for (const step of steps) refuse(stepNameRefusal(step?.name));
  const twice = steps.find((step, i) => steps.findIndex((other) => other.name === step.name) !== i);
  if (twice) refuse(twiceRefusal(twice.name));
  const { agents, skills } = found;
  refuse(codexModeRefusal(steps, agents));
  const texts = steps.map((step) => [step.name, renderStep(ownLine(step, agents))] as const);
  const read = (file: string): string | undefined => {
    try {
      return fs.readFileSync(path.resolve(at, file), 'utf8');
    } catch {
      return undefined;
    }
  };
  const parsed = parseFolder(texts, read, agents, skills);

  fs.mkdirSync(at, { recursive: true });
  const written: string[] = [];
  const kept: string[] = [];
  const put = (file: string, text: string, same: (there: string) => boolean) => {
    const there = read(file);
    if (there !== undefined && same(there)) return kept.push(file);
    fs.writeFileSync(path.join(at, file), text);
    return written.push(file);
  };
  const names = new Set(texts.map(([name]) => `${name}.md`));
  const removed = entries.filter((e) => e.isFile() && e.name.endsWith('.md') && !isReadme(e.name) && !names.has(e.name)).map((e) => e.name);
  for (const file of removed) fs.rmSync(path.join(at, file));
  for (const [name, text] of texts) {
    const step = parsed.find((s) => s.name === name);
    put(`${name}.md`, text, (there) => {
      try {
        return isDeepStrictEqual(parseWorkflow(name, there, read, agents), step);
      } catch {
        return false;
      }
    });
  }
  if (readme !== undefined)
    put(entries.find((e) => e.isFile() && isReadme(e.name))?.name ?? 'README.md', readme, (there) => there === readme);
  return { dir: at, steps: parsed, written: written.sort(), kept: kept.sort(), removed: removed.sort() };
}

/**
 * The refusal of the first draft of `steps` that sends a sandbox under the former name, as `codexModeWritten` words it, or undefined
 * where none does.
 */
function codexModeRefusal(steps: readonly StepDraft[], agents: Agents): string | undefined {
  for (const step of steps)
    if (step.permissionMode != null && harnessOfDraft(step, agents) === 'codex') return codexModeWritten(step.name, step.permissionMode);
  return undefined;
}

/**
 * Draft `step` as its own file holds it: one that names its agent `agent:` by name and sends a `disallowedTools` list — the board sends
 * the resolved one, its agent's denies with the step's own — without the rules that agent's file denies, which the step's line adds to
 * (`deniesWith`), so a save never pins its agent's line into the step again. Any other draft as it is.
 */
/** The harness a draft runs on: its own `harness`, else its agent's by its file, else none said. */
function harnessOfDraft(step: StepDraft, agents: Agents): string | undefined {
  if (step.harness != null) return String(step.harness);
  const agent = typeof step.agent === 'string' ? agents.get(step.agent) : undefined;
  return agent === undefined || agent instanceof WorkflowError ? undefined : agent.keys.harness;
}

function ownLine(step: StepDraft, agents: Agents): StepDraft {
  const agent = typeof step.agent === 'string' ? agents.get(step.agent) : undefined;
  if (!step.disallowedTools || agent === undefined || agent instanceof WorkflowError) return step;
  const denies = agentDeniesOf(agent);
  return { ...step, disallowedTools: step.disallowedTools.filter((rule) => !denies.includes(rule)) };
}

/** What `removeWorkflow` did: the folder removed, and the files it held, by their path in it, sorted. */
export type WorkflowRemoved = { dir: string; removed: string[] };

/**
 * A workflow of yours removed whole: the folder `dir`, directly under `<home>/workflows/` of the store `home`, and every file in it.
 *
 * Refused, and nothing removed: the folder of agents or of skills (`agentsFolderRefusal`), a folder anywhere but directly under yours — a
 * repository's workflow is not removed here (`Invalid`); a folder that is a link, since removing it would leave whatever it points at
 * (`Invalid`); a folder not there, or a file of that name (`Missing`); and a folder something still needs, `users` being one sentence each
 * naming the command that frees it, which the caller gathers (`Conflict`).
 */
export function removeWorkflowAt(home: string, dir: string, users: readonly string[] = []): WorkflowRemoved {
  const at = path.resolve(dir);
  const yours = path.resolve(home, 'workflows');
  const folderRefused = agentsFolderRefusal(at);
  if (folderRefused) throw new Invalid({ message: folderRefused });
  if (path.dirname(at) !== yours)
    throw new Invalid({
      message: `${at} is not a workflow of yours (${path.join(yours, '<name>')}): only yours are removed here, and a repository's workflow is removed from its checkout, as a change to commit. Nothing was removed.`,
    });
  const stat = fs.lstatSync(at, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink())
    throw new Invalid({
      message: linkRefusal(at, 'removing it would remove the link and leave the folder it points at. Nothing was removed.'),
    });
  if (!stat?.isDirectory())
    throw new Missing({
      message: stat
        ? `${at} is a file, not a workflow folder: nothing of yours is removed under that name.`
        : `${at} is not there: it was removed already.`,
    });
  if (users.length) throw new Conflict({ message: workflowInUse(at, users) });
  const removed = fs
    .readdirSync(at, { recursive: true, encoding: 'utf8' })
    .filter((file) => !fs.lstatSync(path.join(at, file)).isDirectory())
    .sort();
  fs.rmSync(at, { recursive: true });
  return { dir: at, removed };
}

/**
 * Why `writeWorkflow` does not write `at` unless told it may write anywhere, or `undefined` for a folder it writes: a workflow in the
 * store's `workflows/`, or in a repository's the store knows — `<repo>/workflows/<name>`, for a `repo` of a factory or the one the caller
 * names. The folder itself, not one below it, nor the `workflows/` that holds it: those are the folders the board lists as workflows.
 */
function workflowPlaceRefusal(home: string, at: string, repo?: string): string | undefined {
  const holder = path.dirname(at);
  const store = path.resolve(home, 'workflows');
  if (isWorkflowsHolderAt(home, holder, repo)) return undefined;
  return `${at} is not a workflow in the store's workflows/ (${path.join(store, '<name>')}) nor in a repository's the store knows (<repo>/workflows/<name>, for a factory's repo), and writing a workflow removes the files of the steps it no longer has. Write it to a folder in one of the two, give its repository to a factory (nemia factory add <name> --repo <repo>), or pass { anywhere: true } to write ${at} all the same.`;
}

/** The repositories the store knows, each resolved: every factory's `repos` that reads, and `repo` when the caller names one. */
export function knownReposAt(home: string, repo?: string): Set<string> {
  const known = new Set(readFactoriesAt(home).flatMap((f) => ('repos' in f ? f.repos.map((r) => path.resolve(r)) : [])));
  if (repo) known.add(path.resolve(repo));
  return known;
}

/** The trees of the factories made from a template, each resolved: where such a factory runs from, laid out as a repository. */
const factoryTrees = (home: string): Set<string> =>
  new Set(readFactoriesAt(home).flatMap((f) => ('tree' in f && f.tree !== undefined ? [path.resolve(f.tree)] : [])));

/**
 * Whether `dir` holds the workflows the board lists: the store's `workflows/`, or the `workflows/` of a repository the store knows — a
 * factory's, or `repo` when the caller names one, as the api names its own — or of the tree of a factory made from a template.
 */
export function isWorkflowsHolderAt(home: string, dir: string, repo?: string): boolean {
  const at = path.resolve(dir);
  if (at === path.resolve(home, 'workflows')) return true;
  if (path.basename(at) !== 'workflows') return false;
  return knownReposAt(home, repo).has(path.dirname(at)) || factoryTrees(home).has(path.dirname(at));
}

/**
 * Where a workflow folder's runs would look for its agents and skills beside its own (`Places`): the repository or factory's tree it is in
 * — `<repo>/workflows/<name>`, for a repository a factory names — and the store. A folder of the store's is only the store's.
 */
export function placesAroundAt(home: string, workflowDir: string): Places {
  const repo = path.dirname(path.dirname(path.resolve(workflowDir)));
  return { ...(knownReposAt(home).has(repo) || factoryTrees(home).has(repo) ? { repo } : {}), home };
}

/**
 * `writeWorkflowAt` with its agents and skills read from the disk where a run of the folder would look (`foundAt`): what a caller with
 * no Agent and Skill doors writes with, which no file of `src` is.
 */
const writeWorkflowOnDisk = (
  home: string,
  dir: string,
  steps: readonly StepDraft[],
  readme?: string,
  { anywhere, places }: { anywhere?: boolean; places?: Places } = {},
): WorkflowWritten =>
  writeWorkflowAt(home, dir, steps, readme, {
    ...(anywhere !== undefined && { anywhere }),
    ...(places !== undefined && { places }),
    found: foundAt(path.resolve(dir), places ?? placesAroundAt(home, dir)),
  });

/**
 * A function of this file taking the store's root first, as the old spelling that takes none: `at` the module's root, `HOME`. The one
 * line of this file that reads a root of its own (`test/global-roots.baseline.ts`); each spelling below is called by code not yet on the
 * Workflow door (`test/workflow-door.baseline.ts`).
 */
const atHome =
  <A extends unknown[], R>(at: (home: string, ...args: A) => R) =>
  (...args: A): R =>
    at(HOME, ...args);

/** `writeWorkflowOnDisk` the module's root. */
export const writeWorkflow = atHome(writeWorkflowOnDisk);
/** `removeWorkflowAt` the module's root. */
export const removeWorkflow = atHome(removeWorkflowAt);
