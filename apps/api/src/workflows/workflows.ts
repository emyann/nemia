/**
 * A repository's workflows, for the board: listed, drawn, and started.
 *
 * A workflow is a folder of steps. A repository carries its own checked in, one folder
 * each under `<repo>/workflows/`, and a person keeps their own under `workflows/` in the store the runs are in —
 * `~/.agent-workflows/workflows/`, or under `WF_ROOT` when that is set. Each folder is read with the package's loader,
 * so one `nemia start` would refuse is listed with the loader's refusal, never hidden.
 *
 * The start is `nemia start`'s entry of the package's command table (`START`), its handler `startRun`: it writes the run's record and files
 * nothing — `nemia tick` or `nemia up` files the first step, as it does for a run started at the command line. A start that names an inbox
 * card (`card`) is the same handler's `startFromInbox`, `nemia start <inbox>/<name>.md`'s: the same record, with `from` on it, and the
 * card kept, listed as started.
 * Nothing else here writes; the inbox's own writes are inbox.ts's, and a folder the builder puts back is builder.ts's.
 *
 * A step's page reads one step of one folder through its own router (step/step.ts), which reads the step's file with `stepSourceOf`.
 *
 * Each is answered in the factory the request names (`served`, factories/place.ts): a factory offers only the workflows attached to it,
 * each step its hires fill read with the agent hired, and a run is started in it. The default factory offers every workflow, as it is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Hono } from 'hono';
import {
  agentsFor,
  cardSkills,
  COMMANDS,
  DEFAULT_FACTORY,
  fillsOf,
  foldersIn,
  inboxNameRefusal,
  skillsFor,
  START as START_ENTRY,
  startFactory,
  unfilledRefusal,
  workflowDescription,
  workflowReadme,
  type Factory,
  type FolderLoaded,
  type Places,
} from 'agent-orchestrator';
import {
  contextText,
  isFolderTeam,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
  type AgentSkill,
  type StepKey,
  type Workflow,
} from 'agent-orchestrator/workflow';
import { toldLayers, type ToldLayers } from 'agent-orchestrator/run';
import { NotBlank, readBody, valueAt, type BodyIssue } from '../body.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import type { Engine } from '../store.ts';
import { graphOf, workflowVersion, type RunGraph } from 'agent-orchestrator';
import { runPlaced } from '../store.ts';
import type { PlaceService } from 'agent-orchestrator';

/** Where a workflow is read from: the repository's `workflows/`, or yours, in the store. */
export type WorkflowSource = 'repo' | 'yours';

/**
 * A step's frontmatter as the loader read it, before any run has frozen it: `null` where the step does not set it. The
 * run's page has `StepSpec`, the keys a run shows; this has every key, since choosing a workflow is reading them.
 */
export type WorkflowStepSpec = {
  harness: string | null;
  model: string | null;
  effort: string | null;
  /** The session's context window, in tokens (`context:`, written `200k`, read into the number): null for the model's whole window. */
  context: number | null;
  after: string[];
  resume: string | null;
  input: string[];
  /**
   * `place: folder`: the step works in a folder the run makes, in a run with no repository; `git`: on branches of a repository. Every step
   * file says one; null only for a step frozen on a run record before the key, which worked on a repository.
   */
  place: 'git' | 'folder' | null;
  /** `workspace: main`: the step runs in the repository's own checkout. Null for a step without the line. */
  workspace: 'main' | null;
  /** The factory's folders the step may write (`writable:`), each by its directory's name: empty where it writes none of them. */
  writable: string[];
  /** What of the store the step reads and never writes (`reads:`), each by its name (`inbox`, `costs`): empty where it reads none. */
  reads: string[];
  /**
   * `slot: none`: the run takes no run slot (`WF_MAX_RUNS`). Null for a step without the line, which is the only other thing a step can
   * say.
   */
  slot: 'none' | null;
  /** The agent attached to the step (`agent:`), in agents/ beside the folder: the rest of the keys are resolved with it. Null for none. */
  agent: string | null;
  /** The skills the step adds to its agent's (`skills:`), as its own line names them: empty where it adds none. */
  skills: string[];
  /** The MCP servers the step adds to its agent's (`mcp:`), as its own line names them: empty where it adds none. */
  mcp: string[];
  /** Claude Code's permission mode (`permissionMode:`): null on codex, whose fence is `sandbox`. */
  permissionMode: string | null;
  /**
   * Codex's sandbox (`sandbox:`, or the former key `permissionMode:` a codex file may still carry): null on Claude Code, and where a codex
   * step names none.
   */
  sandbox: string | null;
  tools: string[] | null;
  /** What the session may not have, in Claude Code's permission rules (`disallowedTools:`): empty where the step denies nothing. */
  disallowedTools: string[];
  /**
   * What the session may do without being asked, in the same rules (`allowedTools:`): empty where the step allows nothing beyond its mode.
   */
  allowedTools: string[];
  /**
   * `denials: fail`: a try the harness denied a call reads `denied` and waits on a person. Null for a step without the line, whose denials
   * decide nothing.
   */
  denials: 'fail' | null;
  /** `remote:` as written, `true` or `false`: null where the step has no line. */
  remote: boolean | null;
  deadlineSeconds: number | null;
  /** The most the step's tries may cost together, in dollars (`budget:`). */
  budget: number | null;
  check: string | null;
  retries: number | null;
  /**
   * `gate: true`: the step's closeout waits for a person. Null for a step without the line, which is the only other thing a step can say.
   */
  gate: true | null;
  /** The schema file `output:` names, beside the step. */
  output: string | null;
  /**
   * What `nemia stats` counts of the step's closeouts (`tally:`), each a field its `output:` declares, `field.flag` or `field.key=value`:
   * empty for none.
   */
  tally: string[];
  loop: string | null;
  rounds: number | null;
};

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
 * `renderStep` writes it), `output:` as the file it names, and null for none.
 */
function keyValue(step: Workflow, key: StepKey): string | null {
  const value = key === 'output' ? step.output?.file : key === 'agent' ? step.agent?.name : step[key];
  if (value === undefined) return null;
  if (key === 'context' && typeof value === 'number') return contextText(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  return String(value);
}

/**
 * Every key a step may set, a row each, in `STEP_KEYS`' order: set or not, so a person reads what the step could say as well as what it
 * does.
 */
export const keyRows = (step: Workflow): KeyRow[] =>
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

/** The table's entries the board's workflows are read through, each served on the api alone. */
const LIST = COMMANDS.find((c) => c.name === 'workflows')!;

/**
 * Each folder `dirs` names, loaded as a start on `repo` would load it, in `factory` with its hires: the table's `workflows`, by
 * folder.
 */
export const loadedOf = async (
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  dirs: readonly string[],
  repo: string,
  home: string,
  factory?: Factory,
) =>
  (await runPlaced(placeService, e, LIST.handler({ dirs, repo, ...(factory && { factory: factory.name }) }, undefined, home))) as Record<
    string,
    FolderLoaded
  >;

/**
 * Every workflow `repo` and `home` have that `factory` offers: each folder in each source, by name — in a factory, only those attached to
 * it, and in one made from a template, its tree's first (`sourcesOf`). Loads every folder, so each can say whether it reads, and, in a
 * factory, which steps its hires leave unfilled.
 */
export async function listWorkflows(
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  repo: string,
  home: string,
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
    placeService,
    folders.map((f) => f.dir),
    repo,
    home,
    factory,
  );
  return folders.map(({ name, from, dir }) => listed(name, from, dir, { repo, home }, loaded[dir], factory));
}

/**
 * Where a folder's agents and skills are looked for beyond its own `agents/` and `skills/`, as `nemia start --repo <repo>` looks: the
 * repository's `.claude/`, then yours (`lookupRoots`). The listing, a folder's version and the builder's judgement all read with these, so
 * the board shows a folder as a start would read it.
 */
export const placesOf = (repo: string, home: string): Places => ({ repo, home });

/**
 * One folder as the board lists it, read from disk now, its steps as the table's `workflows` loaded them (`loaded`): what the listing
 * has for it, and what the builder answers a write with. In `factory`, its steps are read with the factory's hires, and those left with no
 * agent named (`unfilled`).
 */
export function listed(
  name: string,
  from: WorkflowSource,
  dir: string,
  places: Places,
  loaded: FolderLoaded,
  factory?: Factory,
): WorkflowListing {
  const description = workflowDescription(dir);
  const readme = workflowReadme(dir);
  const schemas = schemasIn(dir);
  const version = workflowVersion(dir, places);
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
  (step: Workflow): ListedStep => ({
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
const listsOf = (step: Workflow) => ({
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
const wiringOf = (step: Workflow) => ({
  after: step.after,
  resume: step.resume ?? null,
  place: step.place ?? null,
  workspace: step.workspace ?? null,
  slot: step.slot ?? null,
});

export const specOf = (step: Workflow): WorkflowStepSpec => ({
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
  deadlineSeconds: step.deadlineSeconds ?? null,
  budget: step.budget ?? null,
  check: step.check ?? null,
  retries: step.retries ?? null,
  gate: step.gate ?? null,
  output: step.output?.file ?? null,
  loop: step.loop ?? null,
  rounds: step.rounds ?? null,
});

const SHAPE =
  '`{ "workflow": "<name>", "brief": "<what to do>" }`, with `"from": "repo"` or `"yours"` when both have a workflow of that name, `"after": ["<runId>", …]` for the runs it waits on, `"context": ["<runId>", …]` for the runs it reads as context, and `"card": "<name>"` for an inbox card it starts';

/** Why a start with no card and no brief is not one (422). */
const NO_BRIEF = `A run needs a brief: what to do, as \`nemia start <brief>\` takes it. Write it in \`brief\` — the run's steps are told it, under "What was asked for".`;

/**
 * `POST /api/runs`'s body, its keys in the order they are refused: a card's name is refused where it is not one, in the package's words
 * (`inboxNameRefusal`), before its brief is read, and a brief that is no text is refused as a card's (400) or as none (422, `startWords`).
 */
const START_BODY = Schema.Struct({
  workflow: Schema.NonEmptyString,
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  after: Schema.optionalKey(Schema.Array(NotBlank)),
  context: Schema.optionalKey(Schema.Array(NotBlank)),
  card: Schema.optionalKey(Schema.String.check(Schema.makeFilter((card: string) => inboxNameRefusal(card) === undefined))),
  brief: Schema.optionalKey(Schema.String),
});

/** Why `POST /api/runs`'s body is not a start, by the first key its schema refused: a `context` that is not a list of run ids is a 422. */
function startWords({ path: [key], input }: BodyIssue, body: unknown): string | Refusal {
  if (key === 'workflow') return `POST /api/runs names the workflow to start in \`workflow\`, a folder's name: ${SHAPE}.`;
  if (key === 'from')
    return `\`from\` is where the workflow is read from: "repo" or "yours", or left out when only one has a workflow named '${String(valueAt(body, ['workflow']))}'.`;
  if (key === 'after')
    return `\`after\` is the runs this one waits on, by id, as \`nemia start --after <runId>\` takes each: a list of run ids, such as \`"after": ["add-a-cache-k2q9"]\`, or left out for a run that waits on none. This request's was ${JSON.stringify(valueAt(body, ['after']))}. GET /api/runs lists the runs there are.`;
  if (key === 'context') {
    const error = `\`context\` is the runs this one is handed as context, by id, as \`nemia start --from <runId>\` takes each, never waited on: a list of run ids, such as \`"context": ["add-a-cache-k2q9"]\`, or left out for a run handed none. This request's was ${JSON.stringify(valueAt(body, ['context']))}. GET /api/runs lists the runs there are.`;
    return { status: 422, error };
  }
  if (key === 'card') {
    return typeof input === 'string'
      ? (inboxNameRefusal(input) ?? `POST /api/runs takes a JSON object: ${SHAPE}.`)
      : `\`card\` names the inbox card to start, as \`nemia inbox\` lists it: a name, such as \`"card": "cache-the-views-k2q9"\`, or left out for a run that starts from no card. This request's was ${JSON.stringify(input)}. GET /api/inbox lists the cards.`;
  }
  if (key === 'brief' && valueAt(body, ['card']) !== undefined)
    return `\`brief\` is what the run is asked to do in place of the card's body, as \`nemia start <card> --brief "<brief>"\` takes it: text, or left out for the card's body. This request's was ${JSON.stringify(input)}.`;
  if (key === 'brief') return { status: 422, error: NO_BRIEF };
  return `POST /api/runs takes a JSON object: ${SHAPE}.`;
}

/** A start, as the guard's refusals word it (guard.ts). */
const START: Guarded = {
  route: 'POST /api/runs',
  does: 'starts a run',
  forAnother: 'start one',
  why: "a run's brief is what an agent acts on in this repository",
  reach: 'start the run from the board',
  instead: "Start it from the board's Workflows or Inbox page, or with `nemia start`",
  shape: SHAPE,
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
  if (found.length === 1) return { dir: path.join(found[0].dir, name) };
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
      ? `No workflow '${name}' in ${where}. The workflows there are: ${there.join(', ')}. GET /api/workflows lists them, with their steps.`
      : `No workflow '${name}': there is no workflow at all, in ${sources.map((s) => s.dir).join(' or ')}. A workflow is a folder of steps: add one there, such as workflows/dev/implement.md.`,
  };
}

/**
 * What `POST /api/runs` starts: a workflow's folder, with a brief — or, for an inbox card, the card and the brief given in place of its
 * body.
 */
export type Asked =
  | { dir: string; brief: string; after: string[] | undefined; context: string[] | undefined; card?: undefined }
  | { dir: string; brief: string | undefined; after: string[] | undefined; context: string[] | undefined; card: string };

/**
 * What `POST /api/runs` starts off its decoded body, or why it does not: the workflow it names (404, 409), and the brief (422) — the api's
 * own, since `startRun` takes any string and `nemia start` prints its help for none. The body's shape (400) is `START_BODY`'s.
 *
 * `after` is only shaped here: a list of run ids, as `nemia start --after <runId>` takes each, and never a blank one, which the CLI refuses
 * too (`--after=`). Whether this run may wait on each is `startRun`'s to say (`afterRefusal`), in its words. `context` is shaped the same,
 * as `nemia start --from <runId>` takes each; whether each may be handed is `startRun`'s to say (`contextRefusal`).
 *
 * `card` names an inbox card to start, as `nemia inbox` lists it: refused here only for a name that is not a card's (`inboxNameRefusal`,
 * 400, in the package's words), before any folder is read. Whether the card is there, and may start, is `startFromInbox`'s to say. With a
 * card the brief is what the person made of its body, and may be left out, for the body as it is; a blank one is the package's to refuse,
 * as `nemia start <card> --brief ""` is.
 */
function startOf(body: typeof START_BODY.Type, repo: string, home: string, tree?: string): Asked | Refusal {
  const { workflow, brief, from, after, context, card } = body;
  const folder = folderOf(workflow, from, repo, home, tree);
  if ('status' in folder) return folder;
  const handed = { after: after && [...after], context: context && [...context] };
  if (card !== undefined) return { dir: folder.dir, brief, ...handed, card };
  if (brief === undefined || !brief.trim()) return { status: 422, error: NO_BRIEF };
  return { dir: folder.dir, brief: brief.trim(), ...handed };
}

/**
 * What the agent a step is read with says it can do, generated from its skills, found where the load found them (`cardSkills`): null for a
 * step with no agent, one the folder's places do not have, and one whose card the package refuses.
 */
export function agentSkillsOf(step: Workflow, dir: string, places: Places): AgentSkill[] | null {
  const attached = step.agent ? agentsFor(dir, places).get(step.agent.name) : undefined;
  if (attached === undefined || attached instanceof Error) return null;
  try {
    return cardSkills(attached, skillsFor(dir, places));
  } catch {
    return null;
  }
}

/**
 * The inbox card `asked` names, started by `nemia start`'s entry (`START`) with `repo` as the caller's and in the factory `factory` when
 * one is named, over the card's `factory:` — one that names none either way is refused, its fix `?factory=<name>` — and what
 * `POST /api/runs` answers: the run's id and the card's name — the card kept in the inbox, listed as started — and the card's `repo:` the
 * run did not look at.
 */
async function cardStarted(
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  asked: Extract<Asked, { card: string }>,
  repo: string,
  factory: string | undefined,
) {
  const started = await runPlaced(
    placeService,
    e,
    START_ENTRY.handler({
      card: asked.card,
      at: repo,
      factory,
      fix: '?factory=<name>',
      workflows: asked.dir,
      instead: asked.brief,
      after: asked.after,
      context: asked.context,
    }),
  );
  return {
    id: started.id,
    card: started.card,
    ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
  };
}

/**
 * The workflows' routes, and the board's first write.
 *
 * - `GET /api/workflows` — every workflow (`listWorkflows`), read from disk on each request, so a folder a person has just edited lists as
 *   it is now; in a factory (`?factory=`), only those attached to it, read with its hires, each saying what they leave `unfilled` and
 *   each step the agent hired into it (`hired`). 500 for a folder that could not be listed.
 * - `GET /api/workflows/:from/:name/:step` — one step of one folder, for its page: `step` (step/step.ts).
 * - `GET /api/repository` — the repository a start runs in, as the request's `?factory=` and `?repo=` resolve it: what the start form
 *   lists the runs of, for a run to wait on.
 * - `POST /api/runs` — the board's first write, and the one a person makes at the command line: `nemia start <brief> --workflows <folder>
 *   --repo <repo> --after <runId> --from <runId>`, or, with `card`, `nemia start <inbox>/<card>.md --brief <brief> --workflows <folder>
 *   --after <runId>`.
 *   Served by hand, through the entry's handler (`START`). Guarded (guard.ts); the body is refused as `startWords` and `startOf` say.
 *   201 with the run's `Location` once its record is written.
 *   A refusal goes to `app.onError`, which answers it by its kind, word for word (app.ts). Without a card, `nemia start`'s refusal is an
 *   `Invalid`, 422: a folder that does not read as a workflow, a step named for another's check or try, a `.worktreeinclude` it cannot
 *   use, or a run this one cannot wait on (`afterRefusal`). A failure that is not a refusal is a 500, git's on a repository it cannot
 *   branch from among them — no git checkout, no commit — which the queue tries again on its next pass. With a card, the api's repository
 *   is the caller's, as `.` is `nemia start`'s, and the card's `repo:` is over it; the folder is the one
 *   `folderOf` found. `startFromInbox` refuses a card not there as a `Missing` (404), one a run's record already names as a
 *   `Conflict` (409), and the rest as an `Invalid` (422): a card that does not read, a workflow that does not load, a blank brief, and
 *   what `startRun` refuses. The card is kept, and lists as started. A
 *   card whose `repo:` the run looked at none of — a folder team's — carries it as `ignoredRepo`, as `nemia start` prints it and a tick's
 *   line says it (`ignoredRepoLine`): a client that starts a card is told the same fact wherever it started from. In a factory
 *   (`?factory=`), the run is started in it (`startRun`'s `factory`), which refuses a workflow it has not attached, a step its hires leave
 *   unfilled and a repository outside it, each an `Invalid`; a card is started in it too, the request's factory over the card's `factory:`,
 *   as `nemia start <card> --factory` starts it, and refused as `startRun` refuses, the card left in the inbox. Every run is started in a
 *   factory: a start that names none runs in the one factory whose repository holds the api's repository, or `?repo=`, on that
 *   repository (`startFactory`, as `nemia start` finds it), and is refused, `Invalid`, where none or two do; a card that names none either
 *   way is refused, `Invalid` (`unfactoredCardRefusal`), never started in a factory found from its repository; and `?factory=default`,
 *   of a workflow or a card, is refused, `Invalid` (`defaultStartRefusal`): the default factory holds history, and no start names it.
 */
export const workflows = new Hono<ApiEnv>()
  .get('/api/workflows', (c) =>
    served(c, async ({ e, placeService, repo, home, factory }) => c.json(await listWorkflows(e, placeService, repo, home, factory))),
  )
  .get('/api/repository', (c) => served(c, ({ repo }) => c.json({ repo })))
  .post('/api/runs', (c) =>
    served(c, async ({ e, placeService, repo, home, factory }) => {
      const refused = refusedBeforeReading(START, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
      if (refused) return c.json({ error: refused.error }, refused.status);
      const read = await readBody(c.req, START_BODY, `POST /api/runs takes a JSON body: ${SHAPE}.`, startWords);
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const asked = startOf(read.body, repo, home, factory?.tree);
      if ('status' in asked) return c.json({ error: asked.error }, asked.status);
      const named = c.req.query('factory') === DEFAULT_FACTORY ? DEFAULT_FACTORY : factory?.name;
      if (asked.card !== undefined) {
        const started = await cardStarted(e, placeService, asked, repo, named);
        c.header('Location', `/api/runs/${encodeURIComponent(started.id)}`);
        return c.json(started, 201);
      }
      const found = factory ? { factory, repo } : startFactory(named, repo, '?factory=<name>');
      const { id } = await runPlaced(
        placeService,
        e,
        START_ENTRY.handler({
          brief: asked.brief,
          repo: found.repo ?? repo,
          workflows: asked.dir,
          after: asked.after,
          context: asked.context,
          factory: found.factory?.name,
        }),
      );
      c.header('Location', `/api/runs/${encodeURIComponent(id)}`);
      return c.json({ id }, 201);
    }),
  );
