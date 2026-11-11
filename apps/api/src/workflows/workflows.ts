/**
 * A repository's workflows, for the board: listed, drawn, and started.
 *
 * A workflow is a folder of steps. A repository carries its own checked in, one folder
 * each under `<repo>/workflows/`, and a person keeps their own under `workflows/` in the store the runs are in —
 * `~/.agent-workflows/workflows/`, or under `WF_ROOT` when that is set. Each folder is read with the package's loader,
 * so one `nemia start` would refuse is listed with the loader's refusal, never hidden.
 *
 * A start finds the folder its body names here (`folderOf`); the start itself — the Run's `create` and the Card's `start`, `nemia start`'s
 * entry of the package's command table (`START`) — is runs/start.ts's.
 * Nothing else here writes; a card's own writes are the Card's (objects/cards.ts), and a folder the builder puts back is builder.ts's.
 *
 * A step's page reads one step of one folder through its own router (step/step.ts), which reads the step's file with `stepSourceOf`.
 *
 * Each is answered in the factory the request names (`served`, factory/place.ts): a factory offers only the workflows attached to it,
 * each step its hires fill read with the agent hired, and a run is started in it. The default factory offers every workflow, as it is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import {
  cardSkills,
  fillsOf,
  foldersIn,
  foldersLoaded,
  unfilledRefusal,
  workflowDescription,
  workflowReadme,
  type Factory,
  type FolderLoaded,
  type Places,
} from 'agent-orchestrator';
import {
  checkFailurePolicyLine,
  contextText,
  isFolderTeam,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
  type Agents,
  type AgentSkill,
  type SkillsFound,
  type StepKey,
  type StepSpec,
} from 'agent-orchestrator/workflow';
import { toldLayers, type ToldLayers } from 'agent-orchestrator/run';
import type { Refusal } from '../guard.ts';
import { StoreRoot, type Engine, type RunsOn } from '../store.ts';
import { graphOf, workflowVersion, type RunGraph } from 'agent-orchestrator';
import { runPlaced } from '../store.ts';
import type { DefinitionOrigin, StepKeys } from 'objects';

/** Where a workflow is read from: the repository's `workflows/`, or yours, in the store. */
export type WorkflowSource = Extract<DefinitionOrigin, 'repo' | 'yours'>;

/** A list as the board holds it, writable: objects' Schemas read a list as `readonly`. */
type Writable<T> = T extends readonly (infer U)[] ? U[] : T;

/**
 * A step's frontmatter as the loader read it, before any run has frozen it: every key of objects' `StepKeys`, each its value as that
 * Schema reads it, `null` where the step does not set it (a list's empty where its unset is no list). The run object has its steps'
 * frozen spec (`spec.steps`), the keys a run shows; this has every key, since choosing a workflow is reading them.
 */
export type WorkflowStepSpec = { -readonly [K in StepKey]-?: Writable<Exclude<StepKeys[K], undefined>> };

/**
 * A workflow as the board lists it. `name` is its folder's. Each step is its name, its keys (`spec`) and its `body`, what its agent is
 * told: the shape the builder puts a folder back in (builder.ts). `graph` is `graphOf` its steps, as a run of it would be drawn. `schemas`
 * are the `.json` files beside the steps, which an `output:` may name. `error` is the loader's refusal of a folder that does not read as a
 * workflow, whose `steps` are then none. Listed in a factory, each step its hires fill is read with the agent hired.
 */
export type WorkflowListing = {
  name: string;
  from: WorkflowSource;
  dir: string;
  description: string | null;
  /** The folder's README in full, the workflow level's instruction (`workflowReadme`); null for a folder with none. */
  readme: string | null;
  steps: ListedStep[];
  graph: RunGraph;
  schemas: string[];
  /**
   * Whether every step says `place: folder` (`isFolderTeam`): a team that works in folders the run makes and never looks at a
   * repository. What the board reads to file a card for it without a `repo:`, and to say where a run of it does its work. False for a
   * folder that does not load, which has no steps to ask.
   */
  folderTeam: boolean;
  /**
   * What the folder's files held when it was listed (`workflowVersion`): a builder's save carries it, and is refused when the folder holds
   * something else, rather than written over what changed.
   */
  version: string;
  error: string | null;
  /**
   * Why a run of it cannot start in the factory it is listed in, in the package's words (`unfilledRefusal`): the steps its hires leave with
   * no agent, and the hire that fills each. Null where every step has one, in the default factory, and for a folder that does not load.
   */
  unfilled: string | null;
};

/**
 * A step as a workflow's listing has it, and as the builder takes it back. `spec` and `body` are the step resolved, what a run of it would
 * be; for a step with an agent, `own` is what its file sets itself — the keys (the rest are its agent's) and its own note, which follows
 * the agent's instructions in `body`. Null for a step with no agent, whose file is all of it.
 */
export type ListedStep = {
  name: string;
  spec: WorkflowStepSpec;
  body: string;
  own: StepOwn | null;
  /**
   * The agent the factory the listing is in hires into the step (`fillsOf`), which `spec.agent` then names too: a builder writes it into
   * no step file. Null for a step it does not hire into, and in the default factory, which hires no one.
   */
  hired: string | null;
  /**
   * What a run of the step would be told, by layer (`toldLayers`, with no brief): its agent's instructions, your custom instructions for
   * it, and the step's policy — its own note, the skills it adds and the fence lines it tightens. The builder draws a step's layers from
   * it, and a save never writes it back. Null for a step with no agent, whose file is all of it.
   */
  layers: ToldLayers | null;
  /**
   * The MCP servers the step's sessions load, by the names the checkout's `.mcp.json` gives them, its agent's `mcp:` line first, then those
   * its own line adds, each once: empty where neither names any, and for a step with no agent. The step's own line is `spec.mcp`, which
   * a save writes; this one it never writes.
   */
  mcp: string[];
};

/**
 * What a step with an agent sets itself: the keys its file writes, and its own note (empty where the agent's instructions are all of it).
 */
export type StepOwn = { keys: StepKey[]; body: string };

/**
 * One key of a file, as a card's or a step's page lays them out: the key, its value as the package read it — null where the file does not
 * set it — and one line of what it means, the package's (`STEP_KEY_MEANINGS`, `INBOX_KEY_MEANINGS`).
 */
export type KeyRow = { key: string; value: string | null; meaning: string };

/**
 * A step's value for `key`, as a row says it: a list joined, a count in digits, a context window in the package's one form (`200k`, as
 * `renderStep` writes it), `output:` as the file it names, `route:` as its line (`routeLine`), `checkFailurePolicy:` as its line
 * (`checkFailurePolicyLine`), and null for none.
 */
function keyValue(step: StepSpec, key: StepKey): string | null {
  const value = key === 'output' ? step.output?.file : key === 'agent' ? step.agent?.name : step[key];
  if (value === undefined) return null;
  if (key === 'context' && typeof value === 'number') return contextText(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  if (typeof value === 'object') return objectLine(step, key);
  return String(value);
}

/**
 * Every key a step may set, a row each, in `STEP_KEYS`' order: set or not, so a person reads what the step could say as well as what it
 * does.
 */
export const keyRows = (step: StepSpec): KeyRow[] =>
  STEP_KEYS.map((key) => ({ key, value: keyValue(step, key), meaning: STEP_KEY_MEANINGS[key] }));

/** The file of the step `name` in the workflow folder `dir`, as written: frontmatter and all. */
export const stepSourceOf = (dir: string, name: string): string => fs.readFileSync(path.join(dir, `${name}.md`), 'utf8');

/**
 * Where workflows are read from, in the order they are listed: the repository's, then yours — and, in a factory made from a template, its
 * `tree` first, read as the repository's and shadowing its folder of the same name, as a start looks for a bare name.
 */
export const sourcesOf = (repo: string, home: string, tree?: string): Array<{ from: WorkflowSource; dir: string }> => [
  ...(tree !== undefined ? [{ from: 'repo' as const, dir: path.join(tree, 'workflows') }] : []),
  { from: 'repo', dir: path.join(repo, 'workflows') },
  { from: 'yours', dir: path.join(home, 'workflows') },
];

/** The first of `found` from each source: the folder a tree shadows is no second one. */
const unshadowed = <T extends { from: WorkflowSource }>(found: readonly T[], name: (t: T) => string = () => ''): T[] =>
  found.filter((f, i) => found.findIndex((g) => g.from === f.from && name(g) === name(f)) === i);

/**
 * Each folder `dirs` names, loaded as a start on `repo` would load it, in `factory` with its hires and rules (`foldersLoaded`, what the
 * table's `workflows` runs), by folder. The factory is handed whole, so one the store does not hold — a template's render — loads as a
 * factory applied from it would.
 */
export const loadedOf = async (e: Engine['Service'], on: RunsOn, dirs: readonly string[], repo: string, home: string, factory?: Factory) =>
  (await runPlaced({ ...on, home }, e, foldersLoaded(dirs, { repo, home }, factory))) as Record<string, FolderLoaded>;

/** The loading of the folder `dir` among `loaded`, which `loadedOf` gives for each folder it was asked: thrown, naming it, where none. */
export function loadedAt(loaded: Readonly<Record<string, FolderLoaded>>, dir: string): FolderLoaded {
  const folder = loaded[dir];
  if (folder === undefined) throw new Error(`The table's \`workflows\` gave no loading of '${dir}', which it was asked to load.`);
  return folder;
}

/**
 * Every workflow `repo` and `home` have that `factory` offers: each folder in each source, by name — in a factory, only those attached to
 * it, and in one made from a template, its tree's first (`sourcesOf`). Loads every folder, so each can say whether it reads, and, in a
 * factory, which steps its hires leave unfilled. Each folder's version is read through the doors over `inRequest`, the request's services
 * (`Served`), or a test's root given.
 */
export async function listWorkflows(
  e: Engine['Service'],
  on: RunsOn,
  repo: string,
  home: string,
  inRequest: InRequest,
  factory?: Factory,
): Promise<WorkflowListing[]> {
  const folders = unshadowed(
    sourcesOf(repo, home, factory?.tree).flatMap(({ from, dir }) =>
      foldersIn(dir)
        .filter((name) => !factory || factory.workflows.includes(name))
        .map((name) => ({ name, from, dir: path.join(dir, name) })),
    ),
    (f) => f.name,
  );
  const loaded = await loadedOf(
    e,
    on,
    folders.map((f) => f.dir),
    repo,
    home,
    factory,
  );
  const versioned = await inRequest(
    Effect.forEach(folders, (f) => Effect.map(workflowVersion(f.dir, placesOf(repo, home)), (version) => ({ ...f, version }))),
  );
  return versioned.map(({ name, from, dir, version }) => listed(name, from, dir, loadedAt(loaded, dir), version, factory));
}

/**
 * How a read runs a program that needs the store's root: the request's `inRequest` (`Served`), or, in a test, one with the root given.
 */
export type InRequest = <A, E>(program: Effect.Effect<A, E, StoreRoot>) => Promise<A>;

/**
 * Where a folder's agents and skills are looked for beyond its own `agents/` and `skills/`, as `nemia start --repo <repo>` looks: the
 * repository's `.claude/`, then yours (`lookupRoots`). The listing, a folder's version and the builder's judgement all read with these, so
 * the board shows a folder as a start would read it.
 */
export const placesOf = (repo: string, home: string): Places => ({ repo, home });

/**
 * One folder as the board lists it, read from disk now, its steps as the table's `workflows` loaded them (`loaded`): what the listing
 * has for it, and what the builder answers a write with. In `factory`, its steps are read with the factory's hires, and those left with no
 * agent named (`unfilled`). Its `version` is the folder's now (`workflowVersion`), read by the caller over the request's services.
 */
export function listed(
  name: string,
  from: WorkflowSource,
  dir: string,
  loaded: FolderLoaded,
  version: string,
  factory?: Factory,
): WorkflowListing {
  const description = workflowDescription(dir);
  const readme = workflowReadme(dir);
  const schemas = schemasIn(dir);
  if ('error' in loaded) {
    return {
      name,
      from,
      dir,
      description,
      readme,
      steps: [],
      graph: graphOf([]),
      schemas,
      folderTeam: false,
      version,
      error: loaded.error,
      unfilled: null,
    };
  }
  const { steps } = loaded;
  return {
    name,
    from,
    dir,
    description,
    readme,
    steps: steps.map(listedStep(new Map(factory ? Object.entries(fillsOf(factory.hires, name)) : []))),
    graph: graphOf(steps),
    schemas,
    folderTeam: isFolderTeam(steps),
    version,
    error: null,
    unfilled: (factory && unfilledRefusal(steps, factory.name, name)) ?? null,
  };
}

/**
 * A step as the listing has it, in a factory whose hires into its workflow are `hires`, by step: resolved, what its file sets itself where
 * an agent gives it the rest, and the agent hired into it.
 */
const listedStep =
  (hires: ReadonlyMap<string, string>) =>
  (step: StepSpec): ListedStep => ({
    name: step.name,
    spec: specOf(step),
    body: step.body,
    own: step.agent ? { keys: step.agent.keys.filter((key) => key !== 'agent'), body: step.agent.body } : null,
    hired: hires.get(step.name) ?? null,
    layers: step.agent ? toldLayers(step, null) : null,
    mcp: step.agent?.mcp ?? [],
  });

/**
 * The `.json` files directly in a workflow's folder, sorted: the schemas an `output:` may name. None for a folder that cannot be listed.
 */
function schemasIn(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.isDirectory() && !e.name.startsWith('.') && e.name.endsWith('.json'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** The keys of a step that are lists, each empty where the step leaves it unset. */
const listsOf = (step: StepSpec) => ({
  input: step.input ?? [],
  writable: step.writable ?? [],
  reads: step.reads ?? [],
  skills: step.skills ?? [],
  mcp: step.mcp ?? [],
  disallowedTools: step.disallowedTools ?? [],
  allowedTools: step.allowedTools ?? [],
  tally: step.tally ?? [],
});

/** Where a step works and what it waits on, each null where the step does not say it. */
const wiringOf = (step: StepSpec) => ({
  after: step.after,
  resume: step.resume ?? null,
  place: step.place ?? null,
  workspace: step.workspace ?? null,
  slot: step.slot ?? null,
});

/** What a step's session is bounded by, each null where the step does not say it: its time, its memory and its cost. */
const boundsOf = (step: StepSpec) => ({
  deadlineSeconds: step.deadlineSeconds ?? null,
  memory: step.memory ?? null,
  budget: step.budget ?? null,
});

export const specOf = (step: StepSpec): WorkflowStepSpec => ({
  ...listsOf(step),
  ...wiringOf(step),
  harness: step.harness ?? null,
  model: step.model ?? null,
  effort: step.effort ?? null,
  context: step.context ?? null,
  agent: step.agent?.name ?? null,
  permissionMode: step.permissionMode ?? null,
  sandbox: step.sandbox ?? null,
  tools: step.tools ?? null,
  denials: step.denials ?? null,
  remote: step.remote ?? null,
  ...boundsOf(step),
  check: step.check ?? null,
  retries: step.retries ?? null,
  checkFailurePolicy: step.checkFailurePolicy ? checkFailurePolicyLine(step.checkFailurePolicy) : null,
  gate: step.gate ?? null,
  output: step.output?.file ?? null,
  loop: step.loop ?? null,
  rounds: step.rounds ?? null,
  ...routingOf(step),
});

/** A condition's keys and a node's, each null where the step does not say it. */
const routingOf = (step: StepSpec) => ({
  routes: step.routes ?? null,
  route: step.route ? routeLine(step.route) : null,
  when: step.when ?? null,
  ends: step.ends ?? null,
  workflow: step.workflow ?? null,
});

/** A key whose value is an object, as its line writes it in YAML flow: `route:` and `checkFailurePolicy:`; null for any other. */
const objectLine = (step: StepSpec, key: StepKey): string | null => {
  if (key === 'route' && step.route) return routeLine(step.route);
  if (key === 'checkFailurePolicy' && step.checkFailurePolicy) return checkFailurePolicyLine(step.checkFailurePolicy);
  return null;
};

/** A condition's `route:` as its line writes it, in YAML flow. */
const routeLine = (route: NonNullable<StepSpec['route']>): string => {
  if (route.kind === 'judge') return 'judge';
  if (route.kind === 'script') return `{ script: ${route.script} }`;
  const rows = Object.entries(route.table).map(([value, to]) => `${value}: ${to}`);
  return `{ from: ${route.from}, table: { ${rows.join(', ')} } }`;
};

/**
 * The workflow folder a start names, found among the folders the sources have — never joined from what was sent, so no
 * name reaches a folder outside them — or why not: none of that name, or one in each source and no `from` to choose. In a factory made
 * from a template, its `tree` is looked in first.
 */
export function folderOf(
  name: string,
  from: WorkflowSource | undefined,
  repo: string,
  home: string,
  tree?: string,
): { dir: string } | Refusal {
  const sources = sourcesOf(repo, home, tree);
  const found = unshadowed(sources.filter((s) => (!from || s.from === from) && foldersIn(s.dir).includes(name)));
  const [only] = found;
  if (found.length === 1 && only !== undefined) return { dir: path.join(only.dir, name) };
  if (found.length > 1) {
    return {
      status: 409,
      error: `Both the repository and yours have a workflow named '${name}' (${found.map((s) => path.join(s.dir, name)).join(' and ')}). Say which with \`"from": "repo"\` or \`"from": "yours"\`.`,
    };
  }
  const there = sources.flatMap((s) => foldersIn(s.dir).map((folder) => `${folder} (${s.from})`));
  const where = from
    ? sources
        .filter((s) => s.from === from)
        .map((s) => s.dir)
        .join('')
    : sources.map((s) => s.dir).join(' or ');
  return {
    status: 404,
    error: there.length
      ? `No workflow '${name}' in ${where}. The workflows there are: ${there.join(', ')}. GET /api/namespaces/<namespace>/workflows lists them, each Workflow's steps in its \`spec.steps\`: the namespace \`default\`, or the factory's name.`
      : `No workflow '${name}': there is no workflow at all, in ${sources.map((s) => s.dir).join(' or ')}. A workflow is a folder of steps: add one there, such as workflows/dev/implement.md.`,
  };
}

/**
 * What the agent a step is read with says it can do, generated from its skills, found where the load found them (`cardSkills`): null for a
 * step with no agent, one the folder's places do not have, and one whose card the package refuses. `found` is what the folder's places
 * hold, read through the Agent and Skill doors by the handler.
 */
export function agentSkillsOf(step: StepSpec, found: { readonly agents: Agents; readonly skills: SkillsFound }): AgentSkill[] | null {
  const attached = step.agent ? found.agents.get(step.agent.name) : undefined;
  if (attached === undefined || attached instanceof Error) return null;
  try {
    return cardSkills(attached, found.skills);
  } catch {
    return null;
  }
}
