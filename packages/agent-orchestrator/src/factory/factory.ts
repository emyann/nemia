/**
 * A factory: a named grouping in the one store, naming the repositories its work is on and the agents it hires into workflows' steps — its
 * name, the lines `nemia factory` prints, and the words of its refusals. What is on disk is `factory.store.ts`'s; this is pure.
 *
 * The default factory holds everything that names no factory. It is no file: it is listed first, and never added, removed or hired into.
 */
import path from 'node:path';
import { AGENTS_FOLDER, SKILLS_FOLDER, type Workflow } from '../step/step.ts';
import { stepNameRefusal } from '../folder/folder.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import type { Mount } from '../record/record.ts';
import { fireWord, type ScheduleListed } from '../schedule/schedule.ts';
import { untrustedLines, type Untrusted } from '../trust/trust.ts';

/** The one default factory's name: listed by `nemia factory ls`, refused to `nemia factory add` and `nemia factory rm`. */
export const DEFAULT_FACTORY = 'default';

/** A factory's name: a lowercase slug of 1 to 40 characters, since it names a file in the store and, later, a record's field. */
export const FACTORY_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * The agents a factory hires, by the step each fills: `<workflow>/<step>` — the workflow by its folder's name — to the agent's name, one
 * agent a step.
 */
export type Hires = Readonly<Record<string, string>>;

/**
 * The file a factory's instruction, what Nemia is to know of it and no step is told, is read from when its file names none: in the
 * factory's first folder.
 */
export const DEFAULT_INSTRUCTION = 'NEMIA.md';

/**
 * Where a factory's file says its instruction is kept: a file in the factory's first folder, by its path relative to it, or the store.
 */
export type InstructionAt = { path: string } | { store: true };

/**
 * A schedule of a workflow a factory has attached: when the daemon starts a run of it, a cron expression of five or six fields (`cron`),
 * read in the IANA zone `tz`, the machine's when none; what the run is asked (`brief`); the repository it works on (`repo`), the factory's
 * one when none; and when the schedule was written (`since`), before which no fire counts.
 */
export type Schedule = { cron: string; brief: string; repo?: string; tz?: string; since: string };

/**
 * A factory as its file says it: its name, the file's minus `.json`, its repositories, each an absolute path to a directory, the workflows
 * attached to it, each by its folder's name, its hires and its schedules, by workflow; none of each when the file names none.
 * `instruction`: where its instruction is kept, when the file says (`instructionAt`). `template` and `tree`: the template it was made
 * from, and the folder it runs from, its workflows, agents, skills, wiring and instruction, when it was made from one.
 */
export type Factory = {
  name: string;
  repos: readonly string[];
  workflows: readonly string[];
  hires: Hires;
  schedules: Readonly<Record<string, Schedule>>;
  instruction?: InstructionAt;
  template?: FactoryTemplate;
  tree?: string;
};

/** The template a factory was made from (`nemia factory apply`): its folder, its version then, and the parameters given, by name. */
export type FactoryTemplate = { source: string; version: string; params: Readonly<Record<string, string | number | boolean>> };

/**
 * Where a factory's instruction is read: a file in its first folder (`folder`, `path` its path there), or the store's file for it.
 */
export type InstructionPlace = { in: 'folder'; folder: string; path: string; file: string } | { in: 'store'; file: string };

/**
 * Where the instruction of `factory` is read: its tree's `NEMIA.md`, kept by the store, when it was made from a template; the store's
 * file `storeFile` when its file says the store; else the path it names, or
 * `NEMIA.md` when it names none, in its first folder, the first of `repos` as filed.
 */
export function instructionAt(factory: Pick<Factory, 'repos' | 'instruction' | 'tree'>, storeFile: string): InstructionPlace {
  if (factory.tree !== undefined) return { in: 'store', file: path.join(factory.tree, DEFAULT_INSTRUCTION) };
  const at = factory.instruction;
  if (at !== undefined && 'store' in at) return { in: 'store', file: storeFile };
  const folder = factory.repos[0];
  const relative = at?.path ?? DEFAULT_INSTRUCTION;
  return { in: 'folder', folder, path: relative, file: path.join(folder, relative) };
}

/**
 * Why `p` cannot name a factory's instruction in its first folder, or undefined: a path is relative to the folder and stays in it, so an
 * empty one, an absolute one, the folder itself and one that climbs out of it are refused.
 */
export function instructionPathRefusal(p: string): string | undefined {
  const fix = 'Name a file inside the folder by its path from it — NEMIA.md or docs/NEMIA.md, say — or keep the instruction in the store.';
  if (!p.trim()) return `A factory's instruction is a file in its first folder, and this path is empty. ${fix}`;
  if (path.isAbsolute(p)) return `\`${p}\` is absolute, and a factory's instruction is named by its path from its first folder. ${fix}`;
  const normal = path.normalize(p);
  if (normal === '.' || normal === `.${path.sep}`) return `\`${p}\` names the folder itself, not a file in it. ${fix}`;
  if (normal === '..' || normal.startsWith(`..${path.sep}`)) return `\`${p}\` climbs out of the factory's first folder. ${fix}`;
  return undefined;
}

/** A factory as `nemia factory ls` lists it, with its file; or an entry that does not read as one, with why (`error`). */
export type FactoryListing = (Factory & { file: string; status?: TemplateStatus }) | { name: string; file: string; error: string };

/** A condition of a factory made from a template, as Kubernetes words one: its type, `True` or `False`, a reason, a sentence. */
export type FactoryCondition = { type: string; status: 'True' | 'False'; reason: string; message: string };

/**
 * What the controller last observed of a factory made from a template, as `nemia factory ls` lists it: the template's version its base
 * holds (`applied`), null before its first render, and its conditions, none before then.
 */
export type TemplateStatus = { applied: string | null; conditions: readonly FactoryCondition[] };

/** Why `name` cannot name a factory, or undefined: empty, or not a lowercase slug — the slug suggested when lowering its case makes one. */
export function factoryNameRefusal(name: string): string | undefined {
  if (!name) return 'A factory is named by a lowercase slug, and this name is empty. Give the name: nemia factory ls lists them.';
  if (FACTORY_NAME.test(name)) return undefined;
  const lower = name.toLowerCase();
  const suggested = FACTORY_NAME.test(lower) ? ` — ${lower}, say` : ' — pipao or nemia-2, say';
  return `\`${name}\` is not a factory's name: a name is lowercase letters, digits and dashes, starts with a letter or a digit, and is at most 40 characters long${suggested}.`;
}

/** A verb of `nemia factory` that writes a factory's file. */
export type FactoryWrite =
  | 'add'
  | 'rm'
  | 'attach'
  | 'detach'
  | 'hire'
  | 'fire'
  | 'instruction'
  | 'instruct'
  | 'rules'
  | 'schedule'
  | 'unschedule'
  | 'upgrade';

/** What to do in place of `nemia factory <verb>` on the default factory. */
const INSTEAD: Record<FactoryWrite, string> = {
  add: 'Give the factory another name.',
  rm: 'Remove a factory nemia factory ls lists under it.',
  attach: 'It offers every workflow found already: attach to a factory nemia factory ls lists.',
  detach: 'It offers every workflow found, and none can be taken from it: detach from a factory nemia factory ls lists.',
  hire: "In it, a step that names no agent runs as a plain session: hire into a factory nemia factory ls lists, or write the step's agent: line.",
  fire: 'It hires no one: fire in a factory nemia factory ls lists.',
  instruction: 'It keeps no instruction: give one to a factory nemia factory ls lists.',
  instruct: 'It keeps no instruction: write one for a factory nemia factory ls lists.',
  rules: 'It keeps no rules, since it hires no one: write them for a factory nemia factory ls lists.',
  schedule: 'It offers every workflow found, and starts none by itself: schedule in a factory nemia factory ls lists.',
  unschedule: 'It schedules nothing: unschedule in a factory nemia factory ls lists.',
  upgrade: 'It is made from no template: upgrade a factory nemia factory apply made.',
};

/** The refusal of `nemia factory <verb>` on the default factory, which is read, never written. */
export const defaultFactoryRefusal = (verb: FactoryWrite): string =>
  `\`${DEFAULT_FACTORY}\` is the default factory: it holds every run and card that names no factory, and is read, never written, so nemia factory ${verb} does not take it. ${INSTEAD[verb]}`;

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
  const hires = unfilled.map((s) => `nemia factory hire ${factory} <agent> --step ${workflow}/${s}`).join('; ');
  return `${workflow}: in the factory ${factory}, ${which}. Hire an agent into ${unfilled.length === 1 ? 'it' : 'each'} — ${hires}. Nothing was started.`;
}

/**
 * Why a run of `workflow` cannot start in `factory`, or undefined when the factory offers it: a factory offers only the workflows attached
 * to it, and none when none is — named, with the attach that adds it.
 */
export function unattachedRefusal(factory: Pick<Factory, 'name' | 'workflows'>, workflow: string): string | undefined {
  if (factory.workflows.includes(workflow)) return undefined;
  const offers = factory.workflows.length ? `it offers: ${[...factory.workflows].sort().join(', ')}` : 'it offers none yet';
  return `${workflow}: the factory ${factory.name} does not offer this workflow — ${offers}. Attach it: nemia factory attach ${factory.name} ${workflow}. Nothing was started.`;
}

/**
 * Why `factory` hires no one into the steps of `workflow`, which it does not offer: the attach that offers it, then the hire. Said by the
 * hire it refuses (`hireAgent`) and by a step's page before anyone hires.
 */
export const unattachedHireRefusal = (factory: string, workflow: string): string =>
  `${factory} does not offer the workflow ${workflow}, so it hires no one into its steps. Attach it first — nemia factory attach ${factory} ${workflow} — then hire.`;

/**
 * Why no agent can be hired into the step of `workflow` in `factory`, or null where one can, judged in this order: the default factory,
 * which hires no one (`defaultFactoryRefusal`); a workflow the factory does not offer (`unattachedHireRefusal`); and a step whose own file
 * names an agent, `named` — null for none — which fills it in every factory, so a start would refuse a hire beside it. Said by a step's
 * page before anyone hires, and by the hire it refuses (`hireAgent`), which says the file after it.
 */
export function hireRefusalOf(
  factory: Pick<Factory, 'name' | 'workflows'> | undefined,
  workflow: string,
  named: string | null,
): string | null {
  if (factory === undefined || factory.name === DEFAULT_FACTORY) return defaultFactoryRefusal('hire');
  if (!factory.workflows.includes(workflow)) return unattachedHireRefusal(factory.name, workflow);
  if (named === null) return null;
  return `The step's own file names its agent, \`agent: ${named}\`, which fills it in every factory, and a start refuses a hire beside it. To hire into this step, delete its \`agent:\` line.`;
}

/**
 * The repository a run in `factory` works on: `named` when a person named one, else the factory's repository when it has only one, else
 * `fallback` — where `nemia start` is typed, or the daemon's repository for a queued card. With no factory — the default — `named`, else
 * `fallback`. Whether it is one of the factory's is `outsideRefusal`'s to judge.
 */
export function factoryRepo(factory: Pick<Factory, 'repos'> | undefined, named: string | undefined, fallback: string): string {
  if (named !== undefined) return named;
  if (factory?.repos.length === 1) return factory.repos[0];
  return fallback;
}

/**
 * Why a repository run on `repo` cannot start in `factory`, or undefined when `repo` is one of its repositories, each compared as
 * `path.resolve` spells it: the factory's list named, sorted, with the `--repo` that starts it in one, or the `nemia factory add` that
 * files a factory on `repo`, since none adds a repository to a factory.
 */
export function outsideRefusal(factory: Pick<Factory, 'name' | 'repos'>, repo: string): string | undefined {
  const repos = factory.repos.map((r) => path.resolve(r));
  if (repos.includes(path.resolve(repo))) return undefined;
  const sorted = [...repos].sort();
  return `${repo}: the factory ${factory.name} works on ${sorted.join(', ')}, and this repository is not one of them. Name one of them — --repo ${sorted[0]} — or file a factory on this one: nemia factory add <name> --repo ${path.resolve(repo)}. Nothing was started.`;
}

/** A factory one of whose repositories holds a folder, and that repository, as `path.resolve` spells it: the run's root there. */
export type Holding = { factory: Factory; repo: string };

/** Whether the folder `repo` is `folder` or one of its ancestors, each as `path.resolve` spells it: on a separator, never a prefix. */
const holds = (repo: string, folder: string): boolean =>
  folder === repo || folder.startsWith(repo.endsWith(path.sep) ? repo : `${repo}${path.sep}`);

/**
 * Every factory of `factories` with a repository that is the folder `at` or one of its ancestors, in their order, each with that repository
 * — its deepest, when two of one factory's hold it. No winner is chosen: a start resolves a factory only when one alone holds its folder,
 * so nested repositories of two factories are two holders.
 */
export function factoriesHolding(factories: readonly Factory[], at: string): Holding[] {
  const folder = path.resolve(at);
  return factories.flatMap((factory) => {
    const repo = factory.repos
      .map((r) => path.resolve(r))
      .filter((r) => holds(r, folder))
      .sort((a, b) => b.length - a.length)[0];
    return repo === undefined ? [] : [{ factory, repo }];
  });
}

/** The fix `fix` — a start's words with `<name>` in them, `--factory <name>` say — for the factory `name`. */
const fixFor = (fix: string, name: string): string => fix.replace('<name>', name);

/** The store's factories, by name, as a refusal names them to choose from, or how to file the first. */
const choices = (names: readonly string[]): string =>
  names.length ? `one of ${[...names].sort().join(', ')}` : 'once one is filed: nemia factory add <name> --repo <root>';

/**
 * Why a start that names no factory cannot start in the folder `at`: no factory of the store works on it. Names the store's factories
 * (`names`), the start's own fix (`fix`, `--factory <name>` or `?factory=<name>`), the `nemia factory add` that files one on the folder's
 * repository, and the factories whose files do not read (`unread`), which were not looked at.
 */
export function noFactoryRefusal(at: string, names: readonly string[], fix: string, unread: readonly string[] = []): string {
  const skipped = unread.length
    ? ` These factories' files do not read, and were not looked at: ${[...unread].sort().join(', ')} (nemia factory ls).`
    : '';
  return `${path.resolve(at)}: no factory works on this folder, and every run is started in a factory. Name the factory — ${fix}, ${choices(names)} — or file one on this repository and attach the workflow to it: nemia factory add <name> --repo <root>, then nemia factory attach <name> <workflow>.${skipped} Nothing was started.`;
}

/**
 * Why a start that names no factory cannot start in the folder `at`: more than one factory works on it (`holding`), each named with the
 * repository that holds the folder, and a factory is taken from a folder only when one alone does; the fix (`fix`) for each.
 */
export function ambiguousFactoryRefusal(at: string, holding: readonly Holding[], fix: string): string {
  const sorted = [...holding].sort((a, b) => a.factory.name.localeCompare(b.factory.name));
  const which = sorted.map((h) => `${h.factory.name} on ${h.repo}`).join(', ');
  const fixes = sorted.map((h) => fixFor(fix, h.factory.name)).join(', or ');
  return `${path.resolve(at)}: ${sorted.length} factories work on this folder — ${which} — and a start that names none is started in a factory only when one alone works on its folder. Name the one: ${fixes}. Nothing was started.`;
}

/**
 * Why a start cannot name the default factory: it holds the history of the runs and cards that named none, and no run is started in it
 * now. Names the fix (`fix`) and the store's factories (`names`).
 */
export const defaultStartRefusal = (fix: string, names: readonly string[]): string =>
  `\`${DEFAULT_FACTORY}\` is the default factory: it holds the history of the runs and cards that named no factory, and no run is started in it. Name a factory — ${fix}, ${choices(names)}. Nothing was started.`;

/**
 * Why a run in `factory` cannot start: the runtime refuses the step `where` (`<workflow>/<step>`) a folder of the factory, mounted for
 * it (`factoryMounts`), in its words (`why`); then where the mount came from, and what a person can do, since no flag leaves one off.
 */
export const factoryMountRefusal = (factory: Pick<Factory, 'name'>, where: string, why: string): string =>
  `${why}\nThat folder is the factory ${factory.name}'s: a run in it mounts every repository of the factory but its own, read-only, ` +
  `for each local step, and none is left off by hand. Hire into ${where} an agent whose harness holds the mount ` +
  `(nemia factory hire ${factory.name} <agent> --step ${where}); move or rename the folder, then file the factory again on its new path ` +
  `(nemia factory rm ${factory.name}, then nemia factory add ${factory.name} --repo <path> for each, and attach and hire again); ` +
  `or start it in a factory whose repositories that step's harness can hold. Nothing was written.`;

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

/**
 * The folders the step `step` is filed with, of those its run mounts (`mounts`, frozen at start): each writable that its `writable:` names
 * by its directory's name, and read-only otherwise. Undefined for a run that mounts none.
 */
export function stepMounts(step: Pick<Workflow, 'writable'>, mounts: readonly Mount[] | undefined): Mount[] | undefined {
  if (!mounts) return undefined;
  return mounts.map((m) => (step.writable?.includes(path.basename(m.path)) ? { path: m.path, readOnly: false } : m));
}

/** Each folder of `mounts` a local step of `steps` writes (`stepMounts`), with those steps by name, in `mounts`' order. */
export const writersOf = (
  steps: readonly Pick<Workflow, 'name' | 'harness' | 'writable'>[],
  mounts: readonly Mount[] | undefined,
): { path: string; steps: string[] }[] =>
  (mounts ?? [])
    .map((m) => ({
      path: m.path,
      steps: steps.filter((s) => !isRemoteHarness(s.harness) && stepMounts(s, [m])?.[0].readOnly === false).map((s) => s.name),
    }))
    .filter((w) => w.steps.length);

/** The `<workflow>/<step>` where and the line a `writable:` refusal starts with. */
const writableSaid = (workflow: string, step: Pick<Workflow, 'name' | 'writable'>): string =>
  `${workflow}/${step.name}: \`writable: ${(step.writable ?? []).join(', ')}\``;

/**
 * Why the name `name` a step's `writable:` gives (`said`) names no folder the run can mount writable, or undefined: none or two of the
 * factory's repositories (`repos`, resolved) have it as their directory's name, or the one that does is no directory at start — it is
 * not among `mounts`. The run's own repository (`own`) is the step's workspace already, and taken.
 */
function writableNameRefusal(
  said: string,
  name: string,
  repos: readonly string[],
  own: string | undefined,
  mounts: readonly Mount[],
): string | undefined {
  const named = repos.filter((r) => path.basename(r) === name);
  if (!named.length) {
    const names = [...new Set(repos.map((r) => path.basename(r)))].sort().join(', ');
    return `${said} names \`${name}\`, and no folder of the factory has that name — its folders are ${names}. Name one of them by its directory's name, or delete the name. Nothing was started.`;
  }
  if (named.length > 1)
    return `${said} names \`${name}\`, and ${named.length} folders of the factory have that name: ${named.join(', ')}. A step names a folder only when one alone has its name: rename one of the folders, then file the factory again on its new path. Nothing was started.`;
  if (named[0] === own || mounts.some((m) => m.path === named[0])) return undefined;
  return `${said} names \`${name}\`, and ${named[0]} is no directory now, so the run would not mount it. Start the run again once it is there, or delete the name. Nothing was started.`;
}

/**
 * Why a run of `workflow` in `factory` on the repository `repo` (none for a folder run), mounting `mounts` (`factoryMounts`, each a
 * directory now), cannot start, or undefined: a step's `writable:` names a folder by a name no folder of the factory has, or two have, or
 * one that is no directory at start (`writableNameRefusal`); or names any in a run started in no factory, which mounts none.
 */
export function writableRefusal(
  steps: readonly Pick<Workflow, 'name' | 'writable'>[],
  workflow: string,
  factory: Pick<Factory, 'name' | 'repos'> | undefined,
  repo: string | undefined,
  mounts: readonly Mount[],
): string | undefined {
  const repos = [...new Set((factory?.repos ?? []).map((r) => path.resolve(r)))];
  const own = repo === undefined ? undefined : path.resolve(repo);
  for (const step of steps.filter((s) => s.writable?.length)) {
    const said = writableSaid(workflow, step);
    if (!factory)
      return `${said} names folders of the run's factory, and this run is started in none, so it mounts no folder. Start it in a factory — nemia start --factory <name> — or delete the line. Nothing was started.`;
    for (const name of step.writable ?? []) {
      const why = writableNameRefusal(said, name, repos, own, mounts);
      if (why) return why;
    }
  }
  return undefined;
}

/**
 * Why a run in `factory` cannot start: the runtime refuses the step `where` (`<workflow>/<step>`) a folder of the factory its `writable:`
 * names, mounted writable for it (`stepMounts`), in its words (`why`); then what a person can do.
 */
export const writableMountRefusal = (factory: Pick<Factory, 'name'>, where: string, why: string): string =>
  `${why}\nThat folder is the factory ${factory.name}'s, and ${where} names it in \`writable:\`, so the run would mount it writable for that ` +
  `step. Hire into ${where} an agent whose harness holds a writable mount (nemia factory hire ${factory.name} <agent> --step ${where}), ` +
  `or delete the name from \`writable:\`, so the step only reads the folder. Nothing was written.`;

/** A factory's hires as `nemia factory ls` lists them under its line, sorted by step: `build/implement ← ada`. */
const hireLines = (hires: Hires, width: number): string[] =>
  Object.keys(hires)
    .sort()
    .map((step) => `${' '.repeat(width)}  ${step} ← ${hires[step]}`);

/** The workflows a factory offers as `nemia factory ls` lists them under its line, by name — `workflows: build, intake` — or none. */
const workflowLine = (workflows: readonly string[], width: number): string[] =>
  workflows.length ? [`${' '.repeat(width)}  workflows: ${[...workflows].sort().join(', ')}`] : [];

/** Where a factory's instruction is kept, as `nemia factory ls` lists it under its line, when its file says: a path, or the store. */
const instructionLine = (at: InstructionAt | undefined, width: number): string[] =>
  at === undefined ? [] : [`${' '.repeat(width)}  instruction: ${'store' in at ? 'kept in the store' : at.path}`];

/**
 * The template a factory was made from, as `nemia factory ls` lists it under its line: its folder and version, the version applied or that
 * none is yet, and each condition that is not as it should be — `Applied` false, `ConflictsPending` true — with its sentence.
 */
function templateLines(template: FactoryTemplate | undefined, status: TemplateStatus | undefined, width: number): string[] {
  if (template === undefined) return [];
  const pad = ' '.repeat(width);
  const applied = status?.applied ?? null;
  const at = applied === null ? 'not rendered yet: the daemon renders it, nemia up' : `applied at ${applied}`;
  const amiss = (status?.conditions ?? []).filter((c) => (c.type === 'Applied') === (c.status === 'False'));
  return [
    `${pad}  template: ${template.source} ${template.version}, ${at}`,
    ...amiss.map((c) => `${pad}  ${c.type} ${c.status}, ${c.reason}: ${c.message}`),
  ];
}

/** A schedule's next fire and last run as `nemia ls` words them at `now` (`fireWord`), and the refusal kept of its latest fire. */
const whenLines = (s: ScheduleListed, indent: string, now: number): string[] => [
  `${indent}next ${s.next ? fireWord(s.next, now) : 'never'}  last ${s.last ? `${s.last.run} (${fireWord(s.last.at, now)})` : 'none'}`,
  ...(s.refused ? [`${indent}refused: ${s.refused}`] : []),
];

/**
 * A factory's schedules as `nemia factory ls` lists them under its line, by workflow: `schedule janitor  0 9 * * 1  "Read the stats"`,
 * then its next fire and last run from `listed`, the schedules as `schedulesListed` read them at `now`, where it lists the schedule.
 */
const scheduleLines = (factory: Factory, listed: readonly ScheduleListed[], width: number, now: number): string[] =>
  Object.keys(factory.schedules)
    .sort()
    .flatMap((workflow) => {
      const s = factory.schedules[workflow];
      const where = `${s.tz ? ` (${s.tz})` : ''}${s.repo ? ` on ${s.repo}` : ''}`;
      const read = listed.find((l) => l.factory === factory.name && l.workflow === workflow);
      return [
        `${' '.repeat(width)}  schedule ${workflow}  ${s.cron}${where}  ${JSON.stringify(s.brief.split('\n')[0])}`,
        ...(read ? whenLines(read, `${' '.repeat(width)}    `, now) : []),
      ];
    });

/**
 * What `nemia factory ls` prints: the default factory first, then each factory by name with its repositories, or why it does not read;
 * each schedule with its next fire and last run as `listed` reads them at `now`, and each place in `untrusted` under its factory.
 */
export function factoryLines(
  listing: readonly FactoryListing[],
  listed: readonly ScheduleListed[] = [],
  now: number = Date.now(),
  untrusted: readonly Untrusted[] = [],
): string[] {
  const sorted = [...listing].sort((a, b) => a.name.localeCompare(b.name));
  const width = Math.max(DEFAULT_FACTORY.length, ...sorted.map((l) => l.name.length));
  return [
    `${DEFAULT_FACTORY.padEnd(width)}  every run and card that names no factory — read, never written`,
    ...sorted.flatMap((l) => [
      `${l.name.padEnd(width)}  ${'error' in l ? `${l.file} ${l.error}` : l.repos.join(', ')}`,
      ...('error' in l
        ? []
        : [
            ...untrustedLines(l.name, untrusted, width),
            ...templateLines(l.template, l.status, width),
            ...workflowLine(l.workflows, width),
            ...hireLines(l.hires, width),
            ...scheduleLines(l, listed, width, now),
            ...instructionLine(l.instruction, width),
          ]),
    ]),
  ];
}

/** That the store has no factory `name`, and which it has, by name; the default factory is never one to remove. */
export const noFactoryLine = (name: string, names: readonly string[]): string =>
  `no factory ${name} in the store. ${names.length ? `Its factories are: ${[...names].sort().join(', ')}.` : 'It has none but the default: file one with nemia factory add <name> --repo <path>.'}`;
