/**
 * A repository's workflows, for the board: listed, drawn, and started.
 *
 * A workflow is a folder of steps. A repository carries its own checked in, one folder
 * each under `<repo>/workflows/`, and a person keeps their own under `workflows/` in the store the runs are in —
 * `~/.agent-workflows/workflows/`, or under `WF_ROOT` when that is set. Each folder is read with the package's loader,
 * so one `wf start` would refuse is listed with the loader's refusal, never hidden.
 *
 * The start is the package's `start()`, `wf start`'s own: it writes the run's record and files nothing — `wf tick` or
 * `wf up` files the first step, as it does for a run started at the command line. A start that names an inbox card (`card`) is the
 * package's `startFromInbox()` instead, `wf start <inbox>/<name>.md`'s own: the same record, with `from` on it, and the card removed.
 * Nothing else here writes; the inbox's own writes are inbox.ts's, and a folder the builder puts back is builder.ts's.
 *
 * A step's page reads one step of one folder, as written and as the loader read it (`GET /api/workflows/:from/:name/:step`), at the address
 * the page itself has on the board.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Hono } from 'hono';
import {
  agentsFor,
  agentVersion,
  cardSkills,
  inboxNameRefusal,
  loadWorkflows,
  lookupRoots,
  skillsFor,
  start,
  startFromInbox,
  workflowDescription,
  type Places,
} from 'agent-orchestrator';
import {
  AGENTS_FOLDER,
  contextText,
  isFolderTeam,
  SKILLS_FOLDER,
  splitFrontmatter,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
  type AgentSkill,
  type StepKey,
  type Workflow,
} from 'agent-orchestrator/workflow';
import { NotBlank, readBody, valueAt, type BodyIssue } from '../body.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import { graphOf, type RunGraph } from '../runs/graph.ts';

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
  /** `workspace: main`: the step runs in the repository's own checkout; `folder`: in a folder the run makes, in a run with no repository. Null for a step without the line. */
  workspace: 'main' | 'folder' | null;
  /** `slot: none`: the run takes no run slot (`WF_MAX_RUNS`). Null for a step without the line, which is the only other thing a step can say. */
  slot: 'none' | null;
  /** The agent attached to the step (`agent:`), in agents/ beside the folder: the rest of the keys are resolved with it. Null for none. */
  agent: string | null;
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
  /** What the session may do without being asked, in the same rules (`allowedTools:`): empty where the step allows nothing beyond its mode. */
  allowedTools: string[];
  /** `denials: fail`: a try the harness denied a call reads `denied` and waits on a person. Null for a step without the line, whose denials decide nothing. */
  denials: 'fail' | null;
  /** `background:` as written, `true` or `false`: null where the step has no line, and runs as a job (`claude -p`). */
  background: boolean | null;
  /** `remote:` as written, `true` or `false`: null where the step has no line. */
  remote: boolean | null;
  deadlineSeconds: number | null;
  /** The most the step's tries may cost together, in dollars (`budget:`). */
  budget: number | null;
  check: string | null;
  retries: number | null;
  /** `gate: true`: the step's closeout waits for a person. Null for a step without the line, which is the only other thing a step can say. */
  gate: true | null;
  /** The schema file `output:` names, beside the step. */
  output: string | null;
  loop: string | null;
  rounds: number | null;
};

/**
 * A workflow as the board lists it. `name` is its folder's. Each step is its name, its keys (`spec`) and its `body`, what its agent is told:
 * the shape the builder puts a folder back in (builder.ts). `graph` is `graphOf` its steps, as a run of it would be drawn. `schemas` are the
 * `.json` files beside the steps, which an `output:` may name. `error` is the loader's refusal of a folder that does not read as a workflow,
 * whose `steps` are then none.
 */
export type WorkflowListing = {
  name: string;
  from: WorkflowSource;
  dir: string;
  description: string | null;
  steps: ListedStep[];
  graph: RunGraph;
  schemas: string[];
  /**
   * Whether every step says `workspace: folder` (`isFolderTeam`): a team that works in folders the run makes and never looks at a
   * repository. What the board reads to file a card for it without a `repo:`, and to say where a run of it does its work. False for a
   * folder that does not load, which has no steps to ask.
   */
  folderTeam: boolean;
  /**
   * What the folder's files held when it was listed (`versionOf`): a builder's save carries it, and is refused when the folder holds
   * something else, rather than written over what changed.
   */
  version: string;
  error: string | null;
};

/**
 * A step as a workflow's listing has it, and as the builder takes it back. `spec` and `body` are the step resolved, what a run of it would
 * be; for a step with an agent, `own` is what its file sets itself — the keys (the rest are its agent's) and its own note, which follows
 * the agent's instructions in `body`. Null for a step with no agent, whose file is all of it.
 */
export type ListedStep = { name: string; spec: WorkflowStepSpec; body: string; own: StepOwn | null };

/** What a step with an agent sets itself: the keys its file writes, and its own note (empty where the agent's instructions are all of it). */
export type StepOwn = { keys: StepKey[]; body: string };

/**
 * One key of a file, as a card's or a step's page lays them out: the key, its value as the package read it — null where the file does not
 * set it — and one line of what it means, the package's (`STEP_KEY_MEANINGS`, `INBOX_KEY_MEANINGS`).
 */
export type KeyRow = { key: string; value: string | null; meaning: string };

/**
 * What a step's page shows: which workflow and step, its body, the file as written — frontmatter and all — and every key a step may set, in
 * the package's order, with its value as the loader read it. Read so, `after` names the step `resume:` implies too, and a loop's `rounds` is
 * the default where the file sets none: the file as written says which. `agentSkills` is what the agent attached to the step says it can do,
 * generated from its skills and shown here read-only, as on the agent's page; null on a step with no agent, or one with no card.
 */
export type WorkflowStepPage = {
  workflow: string;
  from: WorkflowSource;
  dir: string;
  step: string;
  body: string;
  source: string;
  keys: KeyRow[];
  agentSkills: AgentSkill[] | null;
};

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

/** Every key a step may set, a row each, in `STEP_KEYS`' order: set or not, so a person reads what the step could say as well as what it does. */
export const keyRows = (step: Workflow): KeyRow[] =>
  STEP_KEYS.map((key) => ({ key, value: keyValue(step, key), meaning: STEP_KEY_MEANINGS[key] }));

/** Where workflows are read from, in the order they are listed: the repository's, then yours. */
export const sourcesOf = (repo: string, home: string): Array<{ from: WorkflowSource; dir: string }> => [
  { from: 'repo', dir: path.join(repo, 'workflows') },
  { from: 'yours', dir: path.join(home, 'workflows') },
];

/** Every workflow `repo` and `home` have: each folder in each source, by name. Loads every folder, so each can say whether it reads. */
export function listWorkflows(repo: string, home: string): WorkflowListing[] {
  return sourcesOf(repo, home).flatMap(({ from, dir }) =>
    foldersIn(dir).map((name) => listed(name, from, path.join(dir, name), { repo, home })),
  );
}

/**
 * Where a folder's agents and skills are looked for beyond its own `agents/` and `skills/`, as `wf start --repo <repo>` looks: the repository's
 * `.claude/`, then yours (`lookupRoots`). The listing, a folder's version and the builder's judgement all read with these, so the board shows a
 * folder as a start would read it.
 */
export const placesOf = (repo: string, home: string): Places => ({ repo, home });

/** One folder as the board lists it, read from disk now: what the listing has for it, and what the builder answers a write with. */
export function listed(name: string, from: WorkflowSource, dir: string, places: Places): WorkflowListing {
  const description = workflowDescription(dir);
  const schemas = schemasIn(dir);
  const version = versionOf(dir, places);
  let steps: Workflow[];
  try {
    steps = loadWorkflows(dir, places);
  } catch (err) {
    return {
      name,
      from,
      dir,
      description,
      steps: [],
      graph: graphOf([]),
      schemas,
      folderTeam: false,
      version,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    name,
    from,
    dir,
    description,
    steps: steps.map(listedStep),
    graph: graphOf(steps),
    schemas,
    folderTeam: isFolderTeam(steps),
    version,
    error: null,
  };
}

/** A step as the listing has it: resolved, and what its file sets itself where an agent gives it the rest. */
const listedStep = (step: Workflow): ListedStep => ({
  name: step.name,
  spec: specOf(step),
  body: step.body,
  own: step.agent ? { keys: step.agent.keys.filter((key) => key !== 'agent'), body: step.agent.body } : null,
});

/**
 * What a folder's files hold, as one word: a digest of each `.md` and `.json` directly in it — its steps, its README and its schemas, what a
 * save writes, removes or reads — by name, with what it holds. Hidden ones too: the package reads a `.draft.md` as a step and `writeWorkflow`
 * removes it when the steps saved do not have it, and an `output:` may name a hidden schema. Any of them edited, added or removed changes it,
 * and nothing else does: a note beside the steps, or a folder inside, is no step. A file that cannot be read counts as what it says, so it
 * changes the word too. So does each agent a step names (`agent:`), as the package versions it (`agentVersion`): its file, where the load
 * finds it (`lookupRoots`), each file it names beside it — the schema of its `output:`, its `card:` — and each skill folder its `skills:` gives:
 * what the board shows a step with an agent is the agent's keys, words, declared fields and skills as much as the step's, and an agent edited
 * after the listing is a step the board does not show as it is.
 */
export function versionOf(dir: string, places: Places): string {
  let names: string[];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.isDirectory() && /\.(md|json)$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    names = [];
  }
  const read = (file: string): string | { unreadable: string } => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      return { unreadable: err instanceof Error ? err.message : String(err) };
    }
  };
  const files = names.map((name) => [name, read(path.join(dir, name))] as const);
  const named = [...new Set(files.flatMap(([, text]) => (typeof text === 'string' ? frontmatterValue(text, 'agent') : [])))].sort();
  const skills = named.length ? skillsFor(dir, places) : undefined;
  const agents = named.map((agent) => {
    const root = lookupRoots(dir, places).find((at) =>
      fs.lstatSync(path.join(at, AGENTS_FOLDER, `${agent}.md`), { throwIfNoEntry: false }),
    );
    return [
      agent,
      root === undefined ? { missing: agent } : { at: root, version: agentVersion(path.join(root, AGENTS_FOLDER), agent, skills) },
    ];
  });
  return createHash('sha256')
    .update(JSON.stringify([...files, ...agents]))
    .digest('hex')
    .slice(0, 16);
}

/**
 * The value a file's frontmatter gives `key`, read as the parser reads it — each line trimmed, the key trimmed before its colon — so
 * `  agent: coder` and `agent : coder` name the agent they load with. None for a file with no such line, or whose frontmatter never
 * closes (the load refuses it). A name with a slash names no file of agents/.
 */
function frontmatterValue(text: string, key: 'agent'): string[] {
  let block: string | null;
  try {
    block = splitFrontmatter('', text).block;
  } catch {
    return [];
  }
  for (const raw of (block ?? '').split('\n')) {
    const line = raw.trim();
    const i = line.indexOf(':');
    if (line.startsWith('#') || i <= 0 || line.slice(0, i).trim() !== key) continue;
    const value = line.slice(i + 1).trim();
    return value && !/[\\/]/.test(value) ? [value] : [];
  }
  return [];
}

/** The `.json` files directly in a workflow's folder, sorted: the schemas an `output:` may name. None for a folder that cannot be listed. */
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

export const specOf = (step: Workflow): WorkflowStepSpec => ({
  harness: step.harness ?? null,
  model: step.model ?? null,
  effort: step.effort ?? null,
  context: step.context ?? null,
  after: step.after,
  resume: step.resume ?? null,
  input: step.input ?? [],
  workspace: step.workspace ?? null,
  slot: step.slot ?? null,
  agent: step.agent?.name ?? null,
  permissionMode: step.permissionMode ?? null,
  sandbox: step.sandbox ?? null,
  tools: step.tools ?? null,
  disallowedTools: step.disallowedTools ?? [],
  allowedTools: step.allowedTools ?? [],
  denials: step.denials ?? null,
  background: step.background ?? null,
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

/**
 * The folders directly in `dir`, sorted, a link to one included. None when `dir` is not there. A hidden folder is not a
 * workflow — `.git`, where a person keeps their workflows in git, or an editor's `.vscode` — so it is not listed, and no start
 * can name it; nor is `agents/`, whose files are the agents the workflows beside it name, nor `skills/`, the skills those agents give.
 */
export function foldersIn(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException).code ?? '')) return [];
    throw new Error(
      `${dir} could not be listed (${err instanceof Error ? err.message : String(err)}), so no workflow in it is shown. Check its permissions.`,
      {
        cause: err,
      },
    );
  }
  return names
    .filter((name) => {
      if (name.startsWith('.') || name === AGENTS_FOLDER || name === SKILLS_FOLDER) return false;
      try {
        return fs.statSync(path.join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

const SHAPE =
  '`{ "workflow": "<name>", "brief": "<what to do>" }`, with `"from": "repo"` or `"yours"` when both have a workflow of that name, `"after": ["<runId>", …]` for the runs it waits on, and `"card": "<name>"` for an inbox card it starts';

/** Why a start with no card and no brief is not one (422). */
const NO_BRIEF = `A run needs a brief: what to do, as \`wf start <brief>\` takes it. Write it in \`brief\` — the run's steps are told it, under "What was asked for".`;

/**
 * `POST /api/runs`'s body, its keys in the order they are refused: a card's name is refused where it is not one, in the package's words
 * (`inboxNameRefusal`), before its brief is read, and a brief that is no text is refused as a card's (400) or as none (422, `startWords`).
 */
const START_BODY = Schema.Struct({
  workflow: Schema.NonEmptyString,
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  after: Schema.optionalKey(Schema.Array(NotBlank)),
  card: Schema.optionalKey(Schema.String.check(Schema.makeFilter((card: string) => inboxNameRefusal(card) === undefined))),
  brief: Schema.optionalKey(Schema.String),
});

/** Why `POST /api/runs`'s body is not a start, by the first key its schema refused. */
function startWords({ path: [key], input }: BodyIssue, body: unknown): string | Refusal {
  if (key === 'workflow') return `POST /api/runs names the workflow to start in \`workflow\`, a folder's name: ${SHAPE}.`;
  if (key === 'from')
    return `\`from\` is where the workflow is read from: "repo" or "yours", or left out when only one has a workflow named '${String(valueAt(body, ['workflow']))}'.`;
  if (key === 'after')
    return `\`after\` is the runs this one waits on, by id, as \`wf start --after <runId>\` takes each: a list of run ids, such as \`"after": ["add-a-cache-k2q9"]\`, or left out for a run that waits on none. This request's was ${JSON.stringify(valueAt(body, ['after']))}. GET /api/runs lists the runs there are.`;
  if (key === 'card') {
    return typeof input === 'string'
      ? (inboxNameRefusal(input) ?? `POST /api/runs takes a JSON object: ${SHAPE}.`)
      : `\`card\` names the inbox card to start, as \`wf inbox\` lists it: a name, such as \`"card": "cache-the-views-k2q9"\`, or left out for a run that starts from no card. This request's was ${JSON.stringify(input)}. GET /api/inbox lists the cards.`;
  }
  if (key === 'brief' && valueAt(body, ['card']) !== undefined)
    return `\`brief\` is what the run is asked to do in place of the card's body, as \`wf start <card> --brief "<brief>"\` takes it: text, or left out for the card's body. This request's was ${JSON.stringify(input)}.`;
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
  instead: "Start it from the board's Workflows or Inbox page, or with `wf start`",
  shape: SHAPE,
};

/**
 * The workflow folder a start names, found among the folders the sources have — never joined from what was sent, so no
 * name reaches a folder outside them — or why not: none of that name, or one in each source and no `from` to choose.
 */
export function folderOf(name: string, from: WorkflowSource | undefined, repo: string, home: string): { dir: string } | Refusal {
  const sources = sourcesOf(repo, home);
  const found = sources.filter((s) => (!from || s.from === from) && foldersIn(s.dir).includes(name));
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

/** What `POST /api/runs` starts: a workflow's folder, with a brief — or, for an inbox card, the card and the brief given in place of its body. */
export type Asked =
  | { dir: string; brief: string; after: string[] | undefined; card?: undefined }
  | { dir: string; brief: string | undefined; after: string[] | undefined; card: string };

/**
 * What `POST /api/runs` starts off its decoded body, or why it does not: the workflow it names (404, 409), and the brief (422) — the api's
 * own, since `start()` takes any string and `wf start` prints its help for none. The body's shape (400) is `START_BODY`'s.
 *
 * `after` is only shaped here: a list of run ids, as `wf start --after <runId>` takes each, and never a blank one, which the CLI refuses
 * too (`--after=`). Whether this run may wait on each is `start()`'s to say (`afterRefusal`), in its words.
 *
 * `card` names an inbox card to start, as `wf inbox` lists it: refused here only for a name that is not a card's (`inboxNameRefusal`, 400,
 * in the package's words), before any folder is read. Whether the card is there, and may start, is `startFromInbox`'s to say. With a card the
 * brief is what the person made of its body, and may be left out, for the body as it is; a blank one is the package's to refuse, as
 * `wf start <card> --brief ""` is.
 */
function startOf(body: typeof START_BODY.Type, repo: string, home: string): Asked | Refusal {
  const { workflow, brief, from, after, card } = body;
  const folder = folderOf(workflow, from, repo, home);
  if ('status' in folder) return folder;
  const waits = after && [...after];
  if (card !== undefined) return { dir: folder.dir, brief, after: waits, card };
  if (brief === undefined || !brief.trim()) return { status: 422, error: NO_BRIEF };
  return { dir: folder.dir, brief: brief.trim(), after: waits };
}

/**
 * The workflows' routes, and the board's first write.
 *
 * - `GET /api/workflows` — every workflow (`listWorkflows`), read from disk on each request, so a folder a person has just edited lists as
 *   it is now. 500 for a folder that could not be listed.
 * - `GET /api/workflows/:from/:name/:step` — one step of one folder, for its page (`WorkflowStepPage`): found among the folders the sources
 *   have and the steps the loader read, never joined from what was sent — so no name in the path reaches a file outside the folder — or
 *   why not, in the words a start would use. 400 for a `from` that is neither `repo` nor `yours`; 404 or 409 as `folderOf` says; 422 for
 *   the loader's refusal, word for word (an `Invalid`, answered by `app.onError`), with which the folder is listed and has no step to show;
 *   404 for a step the folder does not have.
 *   The step's resolved agent carries its keys and words, not what its card says it can do: `agentSkills` is generated from the agent's
 *   skills, found where the load found them (`cardSkills`) — the card's A2A skills, one for each Claude Code skill its `skills:` gives a
 *   session, or one made from its description — and null for a card the package refuses, whose words the agent's page shows.
 * - `GET /api/repository` — the repository a start runs in: what the start form lists the runs of, for a run to wait on.
 * - `POST /api/runs` — the board's first write, and the one a person makes at the command line: `wf start <brief> --workflows <folder>
 *   --repo <repo> --after <runId>`, or, with `card`, `wf start <inbox>/<card>.md --brief <brief> --workflows <folder> --after <runId>`.
 *   Guarded (guard.ts); the body is refused as `startWords` and `startOf` say. 201 with the run's `Location` once its record is written.
 *   A refusal goes to `app.onError`, which answers it by its kind, word for word (app.ts). Without a card, `wf start`'s refusal is an
 *   `Invalid`, 422: a folder that does not read as a workflow, a step named for another's check or try, a `.worktreeinclude` it cannot
 *   use, or a run this one cannot wait on (`afterRefusal`). A failure that is not a refusal is a 500, git's on a repository it cannot
 *   branch from among them — no git checkout, no commit — which the queue tries again on its next pass. With a card, the api's repository
 *   is the caller's, as `.` is `wf start`'s, and the card's `repo:` is over it; the folder is the one
 *   `folderOf` found. `startFromInbox` refuses a card not there as a `Missing` (404), one a run's record already names as a
 *   `Conflict` (409), and the rest as an `Invalid` (422): a card that does not read, a workflow that does not load, a blank brief, and
 *   what `start()` refuses. A run started when the card could not be
 *   removed is started all the same: the answer says `removed: false` and `why`, and the card lists as started until it is dropped. A
 *   card whose `repo:` the run looked at none of — a folder team's — carries it as `ignoredRepo`, as `wf start` prints it and a tick's line
 *   says it (`ignoredRepoLine`): a client that starts a card is told the same fact wherever it started from.
 */
export const workflows = new Hono<ApiEnv>()
  .get('/api/workflows', (c) => served(c, ({ repo, home }) => c.json(listWorkflows(repo, home))))
  .get('/api/workflows/:from/:name/:step', (c) =>
    served(c, async ({ repo, home }) => {
      const { from, name, step } = c.req.param();
      if (from !== 'repo' && from !== 'yours') {
        return c.json(
          {
            error: `A step's page names where its workflow is read from: \`repo\` or \`yours\`, as GET /api/workflows lists each workflow's \`from\` — /api/workflows/repo/${name}/${step}, say. This request's was '${from}'.`,
          },
          400,
        );
      }
      const folder = folderOf(name, from, repo, home);
      if ('status' in folder) return c.json({ error: folder.error }, folder.status);
      const steps = loadWorkflows(folder.dir, placesOf(repo, home));
      const found = steps.find((s) => s.name === step);
      if (!found) {
        return c.json(
          { error: `No step '${step}' in workflow ${name} (${folder.dir}). Its steps are: ${steps.map((s) => s.name).join(', ')}.` },
          404,
        );
      }
      const source = fs.readFileSync(path.join(folder.dir, `${found.name}.md`), 'utf8');
      const places = placesOf(repo, home);
      const attached = found.agent ? agentsFor(folder.dir, places).get(found.agent.name) : undefined;
      let agentSkills: AgentSkill[] | null = null;
      if (attached !== undefined && !(attached instanceof Error)) {
        try {
          agentSkills = cardSkills(attached, skillsFor(folder.dir, places));
        } catch {
          agentSkills = null;
        }
      }
      return c.json({
        workflow: name,
        from,
        dir: folder.dir,
        step: found.name,
        body: found.body,
        source,
        keys: keyRows(found),
        agentSkills,
      } satisfies WorkflowStepPage);
    }),
  )
  .get('/api/repository', (c) => served(c, ({ repo }) => c.json({ repo })))
  .post('/api/runs', (c) =>
    served(c, async ({ repo, home }) => {
      const refused = refusedBeforeReading(START, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
      if (refused) return c.json({ error: refused.error }, refused.status);
      const read = await readBody(c.req, START_BODY, `POST /api/runs takes a JSON body: ${SHAPE}.`, startWords);
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const asked = startOf(read.body, repo, home);
      if ('status' in asked) return c.json({ error: asked.error }, asked.status);
      if (asked.card !== undefined) {
        const started = startFromInbox({
          name: asked.card,
          callerRepo: repo,
          workflow: asked.dir,
          ...(asked.brief !== undefined ? { brief: asked.brief } : {}),
          ...(asked.after ? { after: asked.after } : {}),
        });
        c.header('Location', `/api/runs/${encodeURIComponent(started.run.id)}`);
        return c.json(
          {
            id: started.run.id,
            card: started.card.name,
            removed: started.removed,
            ...(started.removed ? {} : { why: started.why }),
            ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
          },
          201,
        );
      }
      const { id } = start({ brief: asked.brief, repo, workflowDir: asked.dir, ...(asked.after ? { after: asked.after } : {}) });
      c.header('Location', `/api/runs/${encodeURIComponent(id)}`);
      return c.json({ id }, 201);
    }),
  );
