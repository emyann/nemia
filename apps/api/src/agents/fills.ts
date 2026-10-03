/**
 * Which steps each agent fills, for the Agents page: in a factory, the steps its hires fill and those its attached workflows' steps name
 * (`agent:`); in the default factory, those the steps name. A step is credited to the agent file a start would run it with — the name
 * written in the step, else the factory's hire into it (`fillsOf`), found in the first of the folder's `lookupRoots` that has
 * `agents/<name>.md` — never to every agent of that name. Each step file is read as the parser reads its `agent:` line, so a folder the
 * loader refuses still says who fills its steps. Everything is read from disk on each call; a factory's file is read, never written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fillsOf, foldersIn, lookupRoots, readFactories, type Factory, type Places } from 'agent-orchestrator';
import { AGENTS_FOLDER, frontmatterKey, stepFiles } from 'agent-orchestrator/workflow';
import type { AgentListing } from './agents.ts';
import { placesOf, sourcesOf, type WorkflowSource } from '../workflows/workflows.ts';

/** A step an agent fills: the step `step` of the workflow `workflow`, read from `from`, and whether a factory hired it there. */
export type AgentFill = { from: WorkflowSource; workflow: string; step: string; hired: boolean };

/** A step filled, and the agent file that fills it, as `path.resolve` spells it. */
export type FilledStep = AgentFill & { file: string };

/**
 * An agent as the Agents page lists it: its listing, the steps it fills in the factory the request names (`fills`), and the names of
 * the factories it fills a step in, sorted (`factories`): the default factory is none of them.
 */
export type LibraryAgent = AgentListing & { fills: AgentFill[]; factories: string[] };

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
function filledIn(from: WorkflowSource, dir: string, workflow: string, hires: ReadonlyMap<string, string>, places: Places): FilledStep[] {
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
 * Every step `factory` fills on `repo` — in the workflows it attaches, of the repository's and of yours — with its hires; with no factory,
 * every step of every workflow, by what its file names. In the order they are listed: by place, then workflow, then step. Throws where a
 * place's folder cannot be listed (`foldersIn`).
 */
export function stepsFilled(repo: string, home: string, factory?: Factory): FilledStep[] {
  const places = placesOf(repo, home);
  return sourcesOf(repo, home).flatMap(({ from, dir }) =>
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
 * Each agent file a factory in the store fills a step with, and the names of those factories, sorted and named once. A factory whose file
 * does not read fills nothing, and hides no other.
 */
export function factoriesFilling(home: string): Map<string, string[]> {
  const byFile = new Map<string, Set<string>>();
  for (const listing of readFactories()) {
    if ('error' in listing) continue;
    for (const file of filesFilledBy(listing, home)) byFile.set(file, (byFile.get(file) ?? new Set<string>()).add(listing.name));
  }
  return new Map([...byFile].map(([file, names]) => [file, [...names].sort()]));
}

/**
 * The agents the Agents page lists, the one writer of their `fills` and `factories`: each of `listings` with the steps of `filled` its file
 * fills, and the factories `byFile` names for its file. In a factory, only the agents that fill a step in it; in the default factory, all.
 */
export function inFactory(
  listings: readonly AgentListing[],
  filled: readonly FilledStep[],
  byFile: ReadonlyMap<string, readonly string[]>,
  factory?: Factory,
): LibraryAgent[] {
  const tagged = listings.map((listing) => {
    const file = path.resolve(listing.file);
    return {
      ...listing,
      fills: filled.filter((fill) => fill.file === file).map(({ from, workflow, step, hired }) => ({ from, workflow, step, hired })),
      factories: [...(byFile.get(file) ?? [])],
    };
  });
  return factory ? tagged.filter((agent) => agent.fills.length > 0) : tagged;
}
