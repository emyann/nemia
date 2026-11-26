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
  isMarkdown,
  textIn,
  unfilledRefusal,
  workflowDescription,
  workflowReadme,
  type Factory,
  type FolderLoaded,
} from 'agent-orchestrator';
import {
  checkFailurePolicyLine,
  contextText,
  isFolderTeam,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
  type Agents,
  type SkillsFound,
  type StepKey,
  type StepSpec,
} from 'agent-orchestrator/workflow';
import { toldLayers, type ToldLayers } from 'agent-orchestrator/run';
import type { Refusal } from '../guard.ts';
import { StoreRoot, type Engine, type RunsOn } from '../store.ts';
import { definitionRevisionsNow, graphOf, type RunGraph } from 'agent-orchestrator';
import { runPlaced } from '../store.ts';
import type { DefinitionOrigin, StepKeys, WorkflowFile } from 'objects';

/** Where a workflow is read from: the repository's `workflows/`, or yours, in the store. */
export type WorkflowSource = Extract<DefinitionOrigin, 'repo' | 'user'>;

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
 * are the `.json` files beside the steps, which an `output:` may name, and `files` the folder's other text files, those among them. `error`
 * is the loader's refusal of a folder that does not read as a workflow, whose `steps` are then none. Listed in a factory, each step its
 * hires fill is read with the agent hired.
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
   * The folder's other text files, sorted by name (`filesIn`): every file directly in it that is no markdown and reads as text — a script
   * its check runs, a schema — with what it holds. A Workflow's `spec.files`; a picture is not among them.
   */
  files: WorkflowFile[];
  /**
   * Whether every step says `place: folder` (`isFolderTeam`): a team that works in folders the run makes and never looks at a
   * repository. What the board reads to file a card for it without a `repo:`, and to say where a run of it does its work. False for a
   * folder that does not load, which has no steps to ask.
   */
  folderTeam: boolean;
  /**
   * The workflow's revision when it was listed (`definitionRevisionNow`), the `resourceVersion` it is served at: a builder's save carries
   * it, and is refused when the workflow stands at another, rather than written over what changed.
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
type StepOwn = { keys: StepKey[]; body: string };

/**
 * A step's value for `key`, as a row says it: a list joined, a count in digits, a context window in the package's one form (`200k`, as
 * `renderStep` writes it), `output:` as the file it names, `route:` as its line (`routeLine`), `checkFailurePolicy:` as its line
 * (`checkFailurePolicyLine`), and null for none.
 */
function keyValue(step: StepSpec, key: StepKey) {
  const value = key === 'output' ? step.output?.file : key === 'agent' ? step.agent?.name : step[key];
  if (value === undefined) return null;
  if (key === 'context' && typeof value === 'number') return contextText(value);
  if (key === 'checks') return objectLine(step, key);
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  if (typeof value === 'object') return objectLine(step, key);
  return String(value);
}

/**
 * Every key a step may set, a row each, in `STEP_KEYS`' order: set or not, so a person reads what the step could say as well as what it
 * does.
 * @param step The step, as the loader read it.
 */
export const keyRows = (step: StepSpec) => STEP_KEYS.map((key) => ({ key, value: keyValue(step, key), meaning: STEP_KEY_MEANINGS[key] }));

/**
 * The file of the step `name` in the workflow folder `dir`, as written: frontmatter and all.
 * @param dir The workflow's folder.
 * @param name The step's name.
 */
export const stepSourceOf = (dir: string, name: string) => fs.readFileSync(path.join(dir, `${name}.md`), 'utf8');

/**
 * Where workflows are read from, in the order they are listed: the repository's, then yours — and, in a factory made from a template, its
 * `tree` first, read as the repository's and shadowing its folder of the same name, as a start looks for a bare name.
 * @param repo The repository's folder.
 * @param home The store's root folder, whose workflows/ is yours.
 * @param tree The factory's tree folder, or undefined where it was made from no template.
 */
const sourcesOf = (repo: string, home: string, tree?: string) =>
  [
    ...(tree !== undefined ? [{ from: 'repo' as const, dir: path.join(tree, 'workflows') }] : []),
    { from: 'repo', dir: path.join(repo, 'workflows') },
    { from: 'user', dir: path.join(home, 'workflows') },
  ] satisfies Array<{ from: WorkflowSource; dir: string }>;

/** The first of `found` from each source: the folder a tree shadows is no second one. */
const unshadowed = <T extends { from: WorkflowSource }>(found: readonly T[], name: (t: T) => string = () => '') =>
  found.filter((f, i) => found.findIndex((g) => g.from === f.from && name(g) === name(f)) === i);

/**
 * Each folder `dirs` names, loaded as a start on `repo` would load it — with none, as one in yours alone — in `factory` with its hires and
 * rules (`foldersLoaded`, what the table's `workflows` runs), by folder. The factory is handed whole, so one the store does not hold — a
 * template's render — loads as a factory applied from it would.
 * @param e The engine the loading runs over.
 * @param on The place, the store's settings and the trace the program runs with (runPlaced).
 * @param dirs The folders to load.
 * @param repo The repository a start would run on, or undefined for none.
 * @param home The store's root folder.
 * @param factory The factory to load them in, with its hires and rules; undefined for none.
 */
export const loadedOf = async (
  e: Engine['Service'],
  on: RunsOn,
  dirs: readonly string[],
  repo: string | undefined,
  home: string,
  factory?: Factory,
) => (await runPlaced({ ...on, home }, e, foldersLoaded(dirs, placesOf(repo, home), factory))) as Record<string, FolderLoaded>;

/**
 * The loading of the folder `dir` among `loaded`, which `loadedOf` gives for each folder it was asked: thrown, naming it, where none.
 * @param loaded The loadings loadedOf gave, by folder.
 * @param dir The folder whose loading is asked.
 */
export function loadedAt(loaded: Readonly<Record<string, FolderLoaded>>, dir: string) {
  const folder = loaded[dir];
  if (folder === undefined) throw new Error(`The table's \`workflows\` gave no loading of '${dir}', which it was asked to load.`);
  return folder;
}

/**
 * Every workflow `repo` and `home` have that `factory` offers: each folder in each source, by name — in a factory, only those attached to
 * it, and in one made from a template, its tree's first (`sourcesOf`). Loads every folder, so each can say whether it reads, and, in a
 * factory, which steps its hires leave unfilled. Each folder's version is read through the doors over `inRequest`, the request's services
 * (`Served`), or a test's root given.
 * @param e The engine the loading runs over.
 * @param on The place, the store's settings and the trace the program runs with (runPlaced).
 * @param repo The repository's folder.
 * @param home The store's root folder.
 * @param inRequest What runs a program over the request's services, which read each folder's version.
 * @param factory The factory whose attached workflows alone are listed; undefined for every one.
 */
export async function listWorkflows(e: Engine['Service'], on: RunsOn, repo: string, home: string, inRequest: InRequest, factory?: Factory) {
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
  const revisions = await inRequest(definitionRevisionsNow());
  return folders.map(({ name, from, dir }) =>
    listed(name, from, dir, loadedAt(loaded, dir), String(revisions.of('Workflow', factory?.name, name)), factory),
  );
}

/**
 * How a read runs a program that needs the store's root: the request's `inRequest` (`Served`), or, in a test, one with the root given.
 */
export type InRequest = <A, E>(program: Effect.Effect<A, E, StoreRoot>) => Promise<A>;

/**
 * Where a folder's agents and skills are looked for beyond its own `agents/` and `skills/`, as `nemia start --repo <repo>` looks: the
 * repository's `.claude/`, then yours (`lookupRoots`). The listing, a folder's version and the builder's judgement all read with these, so
 * the board shows a folder as a start would read it. With no repository (the default factory with no `?repo=`), yours alone.
 * @param repo The repository's folder, or undefined where there is none.
 * @param home The store's root folder.
 */
export const placesOf = (repo: string | undefined, home: string) => (repo === undefined ? { home } : { repo, home });

/**
 * One folder as the board lists it, read from disk now, its steps as the table's `workflows` loaded them (`loaded`): what the listing
 * has for it, and what the builder answers a write with. In `factory`, its steps are read with the factory's hires, and those left with no
 * agent named (`unfilled`). Its `version` is the workflow's revision now (`definitionRevisionsNow`), read by the caller.
 * @param name The workflow's name.
 * @param from Where it is read from.
 * @param dir The workflow's folder.
 * @param loaded Its steps as the table loaded them, or why they did not load.
 * @param version The folder's version now.
 * @param factory The factory whose hires fill its steps; undefined for none.
 */
export function listed(name: string, from: WorkflowSource, dir: string, loaded: FolderLoaded, version: string, factory?: Factory) {
  const description = workflowDescription(dir);
  const readme = workflowReadme(dir);
  const schemas = schemasIn(dir);
  const files = filesIn(dir);
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
      files,
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
    files,
    folderTeam: isFolderTeam(steps),
    version,
    error: null,
    unfilled: (factory && unfilledRefusal(steps, factory.name, name)) ?? null,
  };
}

/**
 * A step as the listing has it, in a factory whose hires into its workflow are `hires`, by step: resolved, what its file sets itself where
 * an agent gives it the rest, and the agent hired into it.
 * @param hires The agent hired into each step, by step.
 */
const listedStep = (hires: ReadonlyMap<string, string>) => (step: StepSpec) => ({
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
function schemasIn(dir: string) {
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

/**
 * The other text files of a workflow's folder, sorted by name: each regular file directly in it that is no markdown and is text by the
 * package's one test (`textIn`), with its text, as a proposal reads the folder. None for a folder that cannot be listed.
 */
function filesIn(dir: string) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && !isMarkdown(e.name))
    .map((e) => e.name)
    .sort()
    .flatMap((name) => {
      try {
        const text = textIn(fs.readFileSync(path.join(dir, name)));
        return text === null ? [] : [{ path: name, text }];
      } catch {
        return [];
      }
    });
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
  memoryRequest: step.memoryRequest ?? null,
  budget: step.budget ?? null,
});

/**
 * A step's spec as the listing has it: each key it sets, null where it sets none.
 * @param step The step, as the loader read it.
 */
export const specOf = (step: StepSpec) => ({
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
  ...checkingOf(step),
  gate: step.gate ?? null,
  output: step.output?.file ?? null,
  loop: step.loop ?? null,
  rounds: step.rounds ?? null,
  ...routingOf(step),
});

/**
 * A step's checks and what they ask, its tries and which of its exits a person answers, and a command node's line, each null where the
 * step does not say it.
 */
const checkingOf = (step: StepSpec) => ({
  check: step.check ?? null,
  checks: step.checks ? checksLine(step.checks) : null,
  run: step.run ?? null,
  checkMemory: step.checkMemory ?? null,
  retries: step.retries ?? null,
  checkFailurePolicy: step.checkFailurePolicy ? checkFailurePolicyLine(step.checkFailurePolicy) : null,
});

/** A condition's keys and a node's, each null where the step does not say it. */
const routingOf = (step: StepSpec) => ({
  routes: step.routes ?? null,
  route: step.route ? routeLine(step.route) : null,
  when: step.when ?? null,
  ends: step.ends ?? null,
  workflow: step.workflow ?? null,
  card: step.card ?? null,
  relabel: step.relabel ?? null,
});

/**
 * A step's `checks:` as its line writes it, in YAML flow (JSON, which YAML reads): each check's name, line and waits, and
 * `usesCheckout: false` where a check uses no checkout.
 */
const checksLine = (checks: NonNullable<StepSpec['checks']>) =>
  JSON.stringify(
    checks.map((c) => ({ name: c.name, run: c.run, after: [...c.after], ...(c.usesCheckout === false ? { usesCheckout: false } : {}) })),
  );

/**
 * A key whose value is an object, as its line writes it in YAML flow: `route:`, `checkFailurePolicy:` and `checks:`; null for any other.
 */
const objectLine = (step: StepSpec, key: StepKey) => {
  if (key === 'checks' && step.checks) return checksLine(step.checks);
  if (key === 'route' && step.route) return routeLine(step.route);
  if (key === 'checkFailurePolicy' && step.checkFailurePolicy) return checkFailurePolicyLine(step.checkFailurePolicy);
  return null;
};

/** A condition's `route:` as its line writes it, in YAML flow. */
const routeLine = (route: NonNullable<StepSpec['route']>) => {
  if (route.kind === 'judge') return 'judge';
  if (route.kind === 'script') return `{ script: ${route.script} }`;
  const rows = Object.entries(route.table).map(([value, to]) => `${value}: ${to}`);
  return `{ from: ${route.from}, table: { ${rows.join(', ')} } }`;
};

/**
 * The workflow folder a start names, found among the folders the sources have — never joined from what was sent, so no
 * name reaches a folder outside them — or why not: none of that name, or one in each source and no `from` to choose. In a factory made
 * from a template, its `tree` is looked in first.
 * @param name The workflow's name the start names.
 * @param from The source to choose, or undefined for either.
 * @param repo The repository's folder.
 * @param home The store's root folder.
 * @param tree The factory's tree folder, looked in first, or undefined where it was made from no template.
 */
export function folderOf(name: string, from: WorkflowSource | undefined, repo: string, home: string, tree?: string) {
  const sources = sourcesOf(repo, home, tree);
  const found = unshadowed(sources.filter((s) => (!from || s.from === from) && foldersIn(s.dir).includes(name)));
  const [only] = found;
  if (found.length === 1 && only !== undefined)
    return { dir: path.join(only.dir, name) } satisfies { dir: string } | Refusal as { dir: string } | Refusal;
  if (found.length > 1) {
    return {
      status: 409,
      error: `Both the repository and yours have a workflow named '${name}' (${found.map((s) => path.join(s.dir, name)).join(' and ')}). Say which with \`"from": "repo"\` or \`"from": "yours"\`.`,
    } satisfies { dir: string } | Refusal as { dir: string } | Refusal;
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
  } satisfies { dir: string } | Refusal as { dir: string } | Refusal;
}

/**
 * What the agent a step is read with says it can do, generated from its skills, found where the load found them (`cardSkills`): null for a
 * step with no agent, one the folder's places do not have, and one whose card the package refuses. `found` is what the folder's places
 * hold, read through the Agent and Skill doors by the handler.
 * @param step The step, as the loader read it.
 * @param found What the folder's places hold: their agents and skills.
 */
export function agentSkillsOf(step: StepSpec, found: { readonly agents: Agents; readonly skills: SkillsFound }) {
  const attached = step.agent ? found.agents.get(step.agent.name) : undefined;
  if (attached === undefined || attached instanceof Error) return null;
  try {
    return cardSkills(attached, found.skills);
  } catch {
    return null;
  }
}
