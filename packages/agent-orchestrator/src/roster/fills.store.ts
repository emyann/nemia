/**
 * Which steps each agent fills, for the Agents page: in a factory, the steps its hires fill and those its attached workflows' steps name
 * (`agent:`); in the default factory, those the steps name. A step is credited to the agent file a start would run it with — the name
 * written in the step, else the factory's hire into it (`fillsOf`), found in the first of the folder's `lookupRoots` that has
 * `agents/<name>.md` — never to every agent of that name. Each step file is read as the parser reads its `agent:` line, so a folder the
 * loader refuses still says who fills its steps. Everything is read from disk on each call; a factory's file is read, never written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_FOLDER } from '../step/step.ts';
import { frontmatterKey } from '../former/former.ts';
import { stepFiles } from '../folder/folder.ts';
import { fillsOf, type Factory, type FactoryListing } from '../factory/factory.ts';
import { lookupRoots, type Places } from '../folder/folder.store.ts';
import { foldersIn } from '../folder/lookup.store.ts';
import type { AgentPlace, FilledStep } from './roster.ts';

/**
 * The file a start of the workflow in `workflowDir` runs for the agent `name`: `agents/<name>.md` in the first of its `lookupRoots` that
 * has one, resolved. None for a name no root has, and for a name holding a path separator, which names no file of `agents/`.
 */
export function agentFileOf(workflowDir: string, name: string, places: Places): string | undefined {
  if (/[\\/]/.test(name)) return undefined;
  return lookupRoots(workflowDir, places)
    .map((root) => path.resolve(root, AGENTS_FOLDER, `${name}.md`))
    .find((file) => fs.lstatSync(file, { throwIfNoEntry: false }));
}

/** The agent a step file names (`agent:`), or none for a file that names none or cannot be read. */
function writtenAgent(file: string): string | undefined {
  try {
    return frontmatterKey(fs.readFileSync(file, 'utf8'), 'agent');
  } catch {
    return undefined;
  }
}

/**
 * Each step of the workflow `workflow`, in `dir`, filled: by the agent its file names, and by the one `hires` puts in it, each credited to
 * its file. A step both name counts under both. None for a folder that cannot be read.
 */
function filledIn(from: AgentPlace, dir: string, workflow: string, hires: ReadonlyMap<string, string>, places: Places): FilledStep[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return stepFiles(entries).flatMap((entry) => {
    const step = path.basename(entry, '.md');
    const named = [
      { name: writtenAgent(path.join(dir, entry)), hired: false },
      { name: hires.get(step), hired: true },
    ];
    return named.flatMap(({ name, hired }) => {
      const file = name === undefined ? undefined : agentFileOf(dir, name, places);
      return file === undefined ? [] : [{ from, workflow, step, hired, file }];
    });
  });
}

/**
 * Every step `factory` fills on `repo` — in the workflows it attaches, of the repository's `workflows/` and of the store `home`'s — with
 * its hires; with no factory, every step of every workflow, by what its file names. In the order they are listed: by place, then workflow,
 * then step. Throws where a place's folder cannot be listed (`foldersIn`).
 */
export function stepsFilled(repo: string, home: string, factory?: Factory): FilledStep[] {
  const places: Places = { repo, home };
  const sources: Array<{ from: AgentPlace; dir: string }> = [
    { from: 'repo', dir: path.join(repo, 'workflows') },
    { from: 'yours', dir: path.join(home, 'workflows') },
  ];
  return sources.flatMap(({ from, dir }) =>
    foldersIn(dir)
      .filter((workflow) => !factory || factory.workflows.includes(workflow))
      .flatMap((workflow) => {
        const hires = new Map(factory ? Object.entries(fillsOf(factory.hires, workflow)) : []);
        return filledIn(from, path.join(dir, workflow), workflow, hires, places);
      }),
  );
}

/** The agent files `factory` fills a step with, on each of its repositories; none on one whose folders cannot be listed. */
const filesFilledBy = (factory: Factory, home: string): string[] =>
  factory.repos.flatMap((repo) => {
    try {
      return stepsFilled(path.resolve(repo), home, factory).map(({ file }) => file);
    } catch {
      return [];
    }
  });

/**
 * Each agent file one of `factories` (`readFactories`) fills a step with, and the names of those factories, sorted and named once. A
 * factory whose file does not read fills nothing, and hides no other.
 */
export function factoriesFilling(factories: readonly FactoryListing[], home: string): Map<string, string[]> {
  const byFile = new Map<string, Set<string>>();
  for (const listing of factories) {
    if ('error' in listing) continue;
    for (const file of filesFilledBy(listing, home)) byFile.set(file, (byFile.get(file) ?? new Set<string>()).add(listing.name));
  }
  return new Map([...byFile].map(([file, names]) => [file, [...names].sort()]));
}
