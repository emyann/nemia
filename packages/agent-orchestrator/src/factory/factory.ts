/**
 * A factory: a named grouping in the one store, naming the repositories its work is on and the agents it hires into workflows' steps — its
 * name, the lines `wf factory` prints, and the words of its refusals. What is on disk is `factory.store.ts`'s; this is pure.
 *
 * The default factory holds everything that names no factory. It is no file: it is listed first, and never added, removed or hired into.
 */
import path from 'node:path';
import { AGENTS_FOLDER, SKILLS_FOLDER, type Workflow } from '../step/step.ts';
import { stepNameRefusal } from '../folder/folder.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import type { Mount } from '../record/record.ts';

/** The one default factory's name: listed by `wf factory ls`, refused to `wf factory add` and `wf factory rm`. */
export const DEFAULT_FACTORY = 'default';

/** A factory's name: a lowercase slug of 1 to 40 characters, since it names a file in the store and, later, a record's field. */
export const FACTORY_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * The agents a factory hires, by the step each fills: `<workflow>/<step>` — the workflow by its folder's name — to the agent's name, one
 * agent a step.
 */
export type Hires = Readonly<Record<string, string>>;

/**
 * A factory as its file says it: its name, the file's minus `.json`, its repositories, each an absolute path to a directory, the workflows
 * attached to it, each by its folder's name, and its hires; none of either when the file names none.
 */
export type Factory = { name: string; repos: readonly string[]; workflows: readonly string[]; hires: Hires };

/** A factory as `wf factory ls` lists it, with its file; or an entry that does not read as one, with why (`error`). */
export type FactoryListing = (Factory & { file: string }) | { name: string; file: string; error: string };

/** Why `name` cannot name a factory, or undefined: empty, or not a lowercase slug — the slug suggested when lowering its case makes one. */
export function factoryNameRefusal(name: string): string | undefined {
  if (!name) return 'A factory is named by a lowercase slug, and this name is empty. Give the name: wf factory ls lists them.';
  if (FACTORY_NAME.test(name)) return undefined;
  const lower = name.toLowerCase();
  const suggested = FACTORY_NAME.test(lower) ? ` — ${lower}, say` : ' — pipao or nemia-2, say';
  return `\`${name}\` is not a factory's name: a name is lowercase letters, digits and dashes, starts with a letter or a digit, and is at most 40 characters long${suggested}.`;
}

/** A verb of `wf factory` that writes a factory's file. */
export type FactoryWrite = 'add' | 'rm' | 'attach' | 'detach' | 'hire' | 'fire';

/** What to do in place of `wf factory <verb>` on the default factory. */
const INSTEAD: Record<FactoryWrite, string> = {
  add: 'Give the factory another name.',
  rm: 'Remove a factory wf factory ls lists under it.',
  attach: 'It offers every workflow found already: attach to a factory wf factory ls lists.',
  detach: 'It offers every workflow found, and none can be taken from it: detach from a factory wf factory ls lists.',
  hire: "In it, a step that names no agent runs as a plain session: hire into a factory wf factory ls lists, or write the step's agent: line.",
  fire: 'It hires no one: fire in a factory wf factory ls lists.',
};

/** The refusal of `wf factory <verb>` on the default factory, which is read, never written. */
export const defaultFactoryRefusal = (verb: FactoryWrite): string =>
  `\`${DEFAULT_FACTORY}\` is the default factory: it holds every run and card that names no factory, and is read, never written, so wf factory ${verb} does not take it. ${INSTEAD[verb]}`;

/**
 * Why `workflow` cannot name a workflow, or undefined: a workflow is named by its folder, which is not empty, not hidden, holds no slash,
 * and is neither the agents' nor the skills' folder. Whether it exists is the start's to judge.
 */
export function workflowNameRefusal(workflow: string): string | undefined {
  if (!workflow || workflow.startsWith('.') || /[\\/]/.test(workflow))
    return `\`${workflow}\` is not a workflow's name: a workflow is named by its folder, not hidden, with no slash — build, say.`;
  if (workflow === AGENTS_FOLDER || workflow === SKILLS_FOLDER)
    return `${workflow}/ holds the agents or the skills beside the workflows, and no workflow has its name. Name the workflow's folder.`;
  return undefined;
}

/**
 * Why `step` and `agent` cannot be a hire, or undefined: `step` is `<workflow>/<step>` — a workflow's name (`workflowNameRefusal`), then a
 * step's name (`stepNameRefusal`) — and `agent` names an agent's file, not empty, hidden, nor holding a slash or a space. Whether they
 * exist is the start's to judge.
 */
export function hireRefusal(step: string, agent: string): string | undefined {
  const parts = step.split('/');
  if (parts.length !== 2)
    return `--step ${step} names a step as <workflow>/<step>, its workflow's folder and its file without .md, one slash between them: --step build/implement, say.`;
  const [workflow, name] = parts;
  const badWorkflow = workflowNameRefusal(workflow);
  if (badWorkflow) return `--step ${step}: ${badWorkflow}`;
  const badStep = stepNameRefusal(name);
  if (badStep) return `--step ${step}: ${badStep}`;
  if (!agent || agent.startsWith('.') || /[\\/\s]/.test(agent))
    return `\`${agent}\` is not an agent's name: an agent is its file in agents/, named without .md — ada, say.`;
  return undefined;
}

/** A factory's hires into the steps of the workflow whose folder is named `workflow`, by step; none of another workflow's. */
export function fillsOf(hires: Hires, workflow: string): Record<string, string> {
  const prefix = `${workflow}/`;
  return Object.fromEntries(
    Object.entries(hires)
      .filter(([step]) => step.startsWith(prefix))
      .map(([step, agent]) => [step.slice(prefix.length), agent]),
  );
}

/**
 * Why a run of `workflow` in the factory `factory` cannot start, or undefined: every step that is left with no agent — its file names none,
 * no hire fills it, and it runs on no remote agent — named, with the hire that fills each: in a factory, hiring is the way to fill a step.
 */
export function unfilledRefusal(
  steps: readonly Pick<Workflow, 'name' | 'agent' | 'harness'>[],
  factory: string,
  workflow: string,
): string | undefined {
  const unfilled = steps.filter((s) => s.agent === undefined && !isRemoteHarness(s.harness)).map((s) => s.name);
  if (!unfilled.length) return undefined;
  const which =
    unfilled.length === 1
      ? `the step ${unfilled[0]} names no agent, and ${factory} hires none into it`
      : `${unfilled.length} steps name no agent, and ${factory} hires none into them: ${unfilled.join(', ')}`;
  const hires = unfilled.map((s) => `wf factory hire ${factory} <agent> --step ${workflow}/${s}`).join('; ');
  return `${workflow}: in the factory ${factory}, ${which}. Hire an agent into ${unfilled.length === 1 ? 'it' : 'each'} — ${hires}. Nothing was started.`;
}

/**
 * Why a run of `workflow` cannot start in `factory`, or undefined when the factory offers it: a factory offers only the workflows attached
 * to it, and none when none is — named, with the attach that adds it.
 */
export function unattachedRefusal(factory: Pick<Factory, 'name' | 'workflows'>, workflow: string): string | undefined {
  if (factory.workflows.includes(workflow)) return undefined;
  const offers = factory.workflows.length ? `it offers: ${[...factory.workflows].sort().join(', ')}` : 'it offers none yet';
  return `${workflow}: the factory ${factory.name} does not offer this workflow — ${offers}. Attach it: wf factory attach ${factory.name} ${workflow}. Nothing was started.`;
}

/**
 * The repository a run in `factory` works on: `named` when a person named one, else the factory's repository when it has only one, else
 * `fallback` — where `wf start` is typed, or the daemon's repository for a queued card. With no factory — the default — `named`, else
 * `fallback`. Whether it is one of the factory's is `outsideRefusal`'s to judge.
 */
export function factoryRepo(factory: Pick<Factory, 'repos'> | undefined, named: string | undefined, fallback: string): string {
  if (named !== undefined) return named;
  if (factory?.repos.length === 1) return factory.repos[0];
  return fallback;
}

/**
 * Why a git run on `repo` cannot start in `factory`, or undefined when `repo` is one of its repositories, each compared as `path.resolve`
 * spells it: the factory's list named, sorted, with the `--repo` that starts it in one, or the `wf factory add` that files a factory on
 * `repo`, since none adds a repository to a factory.
 */
export function outsideRefusal(factory: Pick<Factory, 'name' | 'repos'>, repo: string): string | undefined {
  const repos = factory.repos.map((r) => path.resolve(r));
  if (repos.includes(path.resolve(repo))) return undefined;
  const sorted = [...repos].sort();
  return `${repo}: the factory ${factory.name} works on ${sorted.join(', ')}, and this repository is not one of them. Name one of them — --repo ${sorted[0]} — or file a factory on this one: wf factory add <name> --repo ${path.resolve(repo)}. Nothing was started.`;
}

/**
 * The folders a run in `factory` mounts: its repositories, each as `path.resolve` spells it, sorted and once each, but `repo`, the one
 * the run works on; every one read-only. A folder run works on none of them, gives no `repo`, and mounts them all.
 */
export function factoryMounts(factory: Pick<Factory, 'repos'>, repo: string | undefined): Mount[] {
  const own = repo === undefined ? undefined : path.resolve(repo);
  return [...new Set(factory.repos.map((r) => path.resolve(r)))]
    .filter((r) => r !== own)
    .sort()
    .map((r) => ({ path: r, readOnly: true }));
}

/** A factory's hires as `wf factory ls` lists them under its line, sorted by step: `build/implement ← ada`. */
const hireLines = (hires: Hires, width: number): string[] =>
  Object.keys(hires)
    .sort()
    .map((step) => `${' '.repeat(width)}  ${step} ← ${hires[step]}`);

/** The workflows a factory offers as `wf factory ls` lists them under its line, by name — `workflows: build, intake` — or none. */
const workflowLine = (workflows: readonly string[], width: number): string[] =>
  workflows.length ? [`${' '.repeat(width)}  workflows: ${[...workflows].sort().join(', ')}`] : [];

/** What `wf factory ls` prints: the default factory first, then each factory by name with its repositories, or why it does not read. */
export function factoryLines(listing: readonly FactoryListing[]): string[] {
  const sorted = [...listing].sort((a, b) => a.name.localeCompare(b.name));
  const width = Math.max(DEFAULT_FACTORY.length, ...sorted.map((l) => l.name.length));
  return [
    `${DEFAULT_FACTORY.padEnd(width)}  every run and card that names no factory — read, never written`,
    ...sorted.flatMap((l) => [
      `${l.name.padEnd(width)}  ${'error' in l ? `${l.file} ${l.error}` : l.repos.join(', ')}`,
      ...('error' in l ? [] : [...workflowLine(l.workflows, width), ...hireLines(l.hires, width)]),
    ]),
  ];
}

/** That the store has no factory `name`, and which it has, by name; the default factory is never one to remove. */
export const noFactoryLine = (name: string, names: readonly string[]): string =>
  `no factory ${name} in the store. ${names.length ? `Its factories are: ${[...names].sort().join(', ')}.` : 'It has none but the default: file one with wf factory add <name> --repo <path>.'}`;
