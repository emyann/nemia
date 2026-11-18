/**
 * Which steps each agent fills, for the Agents page: in a factory, the steps its hires fill and those its attached workflows' steps name
 * (`agent:`), its tree's workflows among them where it was made from a template; in the default factory, those the steps name. A step is
 * credited to the agent file a start would run it with — the name written in the step, else the factory's hire into it (`fillsOf`), found
 * in the first of the folder's `lookupRoots` that has `agents/<name>.md` — never to every agent of that name. Each step file is read as
 * the parser reads its `agent:` line, so a folder the loader refuses still says who fills its steps. Everything is read from disk on each
 * call; a factory's file is read, never written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_FOLDER } from '../step/step.ts';
import { frontmatterKey } from '../former/former.ts';
import { stepFiles } from '../folder/folder.ts';
import { fillsOf, type Factory, type FactoryListing, workedOn } from '../factory/factory.ts';
import { lookupRoots, type Places } from '../skills/read.store.ts';
import { foldersIn } from '../folder/lookup.store.ts';
import type { FillPlace, FilledStep } from './roster.ts';

/**
 * The file a start of the workflow in `workflowDir` runs for the agent `name`: `agents/<name>.md` in the first of its `lookupRoots` that
 * has one, resolved. None for a name no root has, and for a name holding a path separator, which names no file of `agents/`.
 *
 * @param workflowDir the workflow's folder, whose own `agents/` is looked in first
 * @param name the agent's name, as a step's `agent:` line or a hire writes it
 * @param places the repository and the store whose folders are looked in after it
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
function filledIn(from: FillPlace, dir: string, workflow: string, hires: ReadonlyMap<string, string>, places: Places): FilledStep[] {
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
 * Every step `factory` fills on `repo` — in the workflows it attaches, of its tree's `workflows/` where it was made from a template, of the
 * repository's `workflows/` and of the store `home`'s — with its hires; with no factory, every step of every workflow, by what its file
 * names. A factory made from a template reads each workflow from the first of those that holds it, as a start in it reads one by its
 * name; any other, from each. In the order they are listed: by place, then workflow, then step; the store's alone where there is no
 * repository. Throws where a place's folder cannot be listed (`foldersIn`).
 *
 * @param repo the repository whose `workflows/` is read, or none to read the store's alone
 * @param home the store, whose `workflows/` is read and whose agents a start finds
 * @param factory the factory read in, whose attached workflows, hires and tree are read; none for the default factory, every workflow
 */
export function stepsFilled(repo: string | undefined, home: string, factory?: Factory): FilledStep[] {
  const places: Places = repo === undefined ? { home } : { repo, home };
  return workflowsFilled(repo, home, factory).flatMap(({ from, dir, workflow }) => {
    const hires = new Map(factory ? Object.entries(fillsOf(factory.hires, workflow)) : []);
    return filledIn(from, dir, workflow, hires, places);
  });
}

/** The folders of the workflows `factory` fills on `repo`, each with its place and name, as `stepsFilled` reads them. */
function workflowsFilled(
  repo: string | undefined,
  home: string,
  factory: Factory | undefined,
): Array<{ from: FillPlace; dir: string; workflow: string }> {
  const tree = factory?.tree;
  const sources: Array<{ from: FillPlace; dir: string }> = [
    ...(tree === undefined ? [] : [{ from: 'factory' as const, dir: path.join(tree, 'workflows') }]),
    ...(repo === undefined ? [] : [{ from: 'repo' as const, dir: path.join(repo, 'workflows') }]),
    { from: 'user', dir: path.join(home, 'workflows') },
  ];
  const read = new Set<string>();
  return sources.flatMap(({ from, dir }) =>
    foldersIn(dir)
      .filter((workflow) => !factory || factory.workflows.includes(workflow))
      .filter((workflow) => tree === undefined || !read.has(workflow))
      .map((workflow) => {
        read.add(workflow);
        return { from, dir: path.join(dir, workflow), workflow };
      }),
  );
}

/**
 * The skills each step `factory` fills on `repo` names on its own `skills:` line, beside its agent's, in the order they are listed. Throws
 * where a place's folder cannot be listed, as `stepsFilled` does.
 * @param repo The repository read, or undefined for the store's workflows alone.
 * @param home The store's root.
 * @param factory The factory whose workflows are read, or undefined for every workflow.
 */
export function stepSkillsNamed(repo: string | undefined, home: string, factory?: Factory): string[] {
  return workflowsFilled(repo, home, factory).flatMap(({ dir }) => {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return [];
    }
    return stepFiles(entries).flatMap((entry) => {
      let text: string;
      try {
        text = fs.readFileSync(path.join(dir, entry), 'utf8');
      } catch {
        return [];
      }
      return (frontmatterKey(text, 'skills') ?? '')
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    });
  });
}

/**
 * The agent files `factory` fills a step with, on each of its repositories, or on its tree alone where it was made from a template and
 * names none; none on one whose folders cannot be listed.
 */
const filesFilledBy = (factory: Factory, home: string): string[] =>
  (workedOn(factory).length === 0 && factory.tree !== undefined ? [undefined] : workedOn(factory)).flatMap((repo) => {
    try {
      return stepsFilled(repo === undefined ? undefined : path.resolve(repo), home, factory).map(({ file }) => file);
    } catch {
      return [];
    }
  });

/**
 * Each agent file one of `factories` (`readFactories`) fills a step with, and the names of those factories, sorted and named once. A
 * factory whose file does not read fills nothing, and hides no other.
 *
 * @param factories the factories as their files list them, each read on each of its repositories
 * @param home the store each factory's steps are read with
 */
export function factoriesFilling(factories: readonly FactoryListing[], home: string): Map<string, string[]> {
  const byFile = new Map<string, Set<string>>();
  for (const listing of factories) {
    if ('error' in listing) continue;
    for (const file of filesFilledBy(listing, home)) byFile.set(file, (byFile.get(file) ?? new Set<string>()).add(listing.name));
  }
  return new Map([...byFile].map(([file, names]) => [file, [...names].sort()]));
}
