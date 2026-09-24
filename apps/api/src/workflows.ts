/**
 * A repository's workflows, for the board: listed, drawn, and started.
 *
 * W in docs/plan-hold-the-bar.md. A workflow is a folder of steps. A repository carries its own checked in, one folder
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
 * the page itself has on the board..
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { HOME, inboxDir, inboxNameRefusal, listRuns, loadAgents, loadWorkflows, start, startFromInbox, workflowDescription } from 'agent-orchestrator';
import { AGENTS_FOLDER, agentsDir, contextText, isFolderTeam, splitFrontmatter, STEP_KEY_MEANINGS, STEP_KEYS, type AgentSkill, type StepKey, type Workflow } from 'agent-orchestrator/workflow';
import { repoOf } from './capabilities.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from './guard.ts';
import { graphOf, type RunGraph } from './graph.ts';

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
  /** Codex's sandbox (`sandbox:`, read from `permissionMode:` in a file written before 2026-09-23): null on Claude Code, and where a codex step names none. */
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
  maxAttempts: number | null;
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
   * What the folder's files held when it was listed (`versionOf`): a builder's save carries it, and is refused when the folder no longer
   * holds that, rather than written over what changed.
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
 * read from beside the agent and shown here read-only — the agent's page is where it is edited; null on a step with no agent, or none.
 */
export type WorkflowStepPage = { workflow: string; from: WorkflowSource; dir: string; step: string; body: string; source: string; keys: KeyRow[]; agentSkills: AgentSkill[] | null };

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
export const keyRows = (step: Workflow): KeyRow[] => STEP_KEYS.map((key) => ({ key, value: keyValue(step, key), meaning: STEP_KEY_MEANINGS[key] }));

/** Where workflows are read from, in the order they are listed: the repository's, then yours. */
export const sourcesOf = (repo: string, home: string = HOME): Array<{ from: WorkflowSource; dir: string }> => [
  { from: 'repo', dir: path.join(repo, 'workflows') },
  { from: 'yours', dir: path.join(home, 'workflows') },
];

/** Every workflow `repo` and `home` have: each folder in each source, by name. Loads every folder, so each can say whether it reads. */
export function listWorkflows(repo: string, home: string = HOME): WorkflowListing[] {
  return sourcesOf(repo, home).flatMap(({ from, dir }) => foldersIn(dir).map((name) => listed(name, from, path.join(dir, name))));
}

/** One folder as the board lists it, read from disk now: what the listing has for it, and what the builder answers a write with. */
export function listed(name: string, from: WorkflowSource, dir: string): WorkflowListing {
  const description = workflowDescription(dir);
  const schemas = schemasIn(dir);
  const version = versionOf(dir);
  let steps: Workflow[];
  try {
    steps = loadWorkflows(dir);
  } catch (err) {
    return { name, from, dir, description, steps: [], graph: graphOf([]), schemas, folderTeam: false, version, error: messageOf(err) };
  }
  return { name, from, dir, description, steps: steps.map(listedStep), graph: graphOf(steps), schemas, folderTeam: isFolderTeam(steps), version, error: null };
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
 * changes the word too. So does each agent a step names (`agent:`), its file in `agents/` beside the folder, and each file that agent names
 * beside it — the schema of its `output:`, the skills of its `skills:`: what the board shows a step with an agent is the agent's keys, words,
 * declared fields and skills as much as the step's, and an agent edited since is a step the board no longer shows as it is.
 */
export function versionOf(dir: string): string {
  let names: string[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.isDirectory() && /\.(md|json)$/.test(e.name)).map((e) => e.name).sort();
  } catch {
    names = [];
  }
  const read = (file: string): string | { unreadable: string } => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      return { unreadable: messageOf(err) };
    }
  };
  const files = names.map((name) => [name, read(path.join(dir, name))] as const);
  const named = [...new Set(files.flatMap(([, text]) => (typeof text === 'string' ? frontmatterValue(text, 'agent') : [])))].sort();
  const agents = named.flatMap((agent) => {
    const text = read(path.join(agentsDir(dir), `${agent}.md`));
    const beside = typeof text === 'string' ? (['output', 'skills'] as const).flatMap((key) => frontmatterValue(text, key)) : [];
    return [[`${AGENTS_FOLDER}/${agent}.md`, text], ...beside.map((file) => [`${AGENTS_FOLDER}/${file}`, read(path.resolve(agentsDir(dir), file))])];
  });
  return createHash('sha256').update(JSON.stringify([...files, ...agents])).digest('hex').slice(0, 16);
}

/**
 * The value a file's frontmatter gives `key`, read as the parser reads it — each line trimmed, the key trimmed before its colon — so
 * `  agent: coder` and `agent : coder` name the agent they load with. None for a file with no such line, or whose frontmatter never
 * closes (the load refuses it). A name with a slash names no file of agents/.
 */
function frontmatterValue(text: string, key: 'agent' | 'output' | 'skills'): string[] {
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
    return value && (key !== 'agent' || !/[\\/]/.test(value)) ? [value] : [];
  }
  return [];
}

/** The `.json` files directly in a workflow's folder, sorted: the schemas an `output:` may name. None for a folder that cannot be listed. */
function schemasIn(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.isDirectory() && !e.name.startsWith('.') && e.name.endsWith('.json')).map((e) => e.name).sort();
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
  maxAttempts: step.maxAttempts ?? null,
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
 * can name it; nor is `agents/`, whose files are the agents the workflows beside it name.
 */
export function foldersIn(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException).code ?? '')) return [];
    throw new Error(`${dir} could not be listed (${messageOf(err)}), so no workflow in it is shown. Check its permissions.`);
  }
  return names.filter((name) => {
    if (name.startsWith('.') || name === AGENTS_FOLDER) return false;
    try {
      return fs.statSync(path.join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  }).sort();
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const SHAPE = '`{ "workflow": "<name>", "brief": "<what to do>" }`, with `"from": "repo"` or `"yours"` when both have a workflow of that name, `"after": ["<runId>", …]` for the runs it waits on, and `"card": "<name>"` for an inbox card it starts';

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
  if (found.length === 1) return { dir: path.join(found[0]!.dir, name) };
  if (found.length > 1) {
    return {
      status: 409,
      error: `Both the repository and yours have a workflow named '${name}' (${found.map((s) => path.join(s.dir, name)).join(' and ')}). Say which with \`"from": "repo"\` or \`"from": "yours"\`.`,
    };
  }
  const there = sources.flatMap((s) => foldersIn(s.dir).map((folder) => `${folder} (${s.from})`));
  const where = `${from ? sources.filter((s) => s.from === from).map((s) => s.dir).join('') : sources.map((s) => s.dir).join(' or ')}`;
  return {
    status: 404,
    error: there.length
      ? `No workflow '${name}' in ${where}. The workflows there are: ${there.join(', ')}. GET /api/workflows lists them, with their steps.`
      : `No workflow '${name}': there is no workflow at all, in ${sources.map((s) => s.dir).join(' or ')}. A workflow is a folder of steps: add one there, such as workflows/dev/implement.md.`,
  };
}

/** What `POST /api/runs` starts: a workflow's folder, with a brief — or, for an inbox card, the card and the brief given in place of its body. */
export type Asked = { dir: string; brief: string; after: string[] | undefined; card?: undefined } | { dir: string; brief: string | undefined; after: string[] | undefined; card: string };

/**
 * What `POST /api/runs` starts, or why it does not: the body's shape (400), the workflow it names (404, 409), and the
 * brief (422) — the api's own, since `start()` takes any string and `wf start` prints its help for none.
 *
 * `after` is only shaped here: a list of run ids, as `wf start --after <runId>` takes each, and never a blank one, which the CLI refuses
 * too (`--after=`). Whether this run may wait on each is `start()`'s to say (`afterRefusal`), in its words.
 *
 * `card` names an inbox card to start, as `wf inbox` lists it: refused here only for a name that is not a card's (`inboxNameRefusal`, 400,
 * in the package's words), before any folder is read. Whether the card is there, and may start, is `startFromInbox`'s to say. With a card the
 * brief is what the person made of its body, and may be left out, for the body as it is; a blank one is the package's to refuse, as
 * `wf start <card> --brief ""` is.
 */
function startOf(body: unknown, repo: string, home: string): Asked | Refusal {
  if (!isObject(body)) return { status: 400, error: `POST /api/runs takes a JSON object: ${SHAPE}.` };
  const { workflow, brief, from, after, card } = body;
  if (typeof workflow !== 'string' || !workflow) return { status: 400, error: `POST /api/runs names the workflow to start in \`workflow\`, a folder's name: ${SHAPE}.` };
  if (from !== undefined && from !== 'repo' && from !== 'yours') {
    return { status: 400, error: `\`from\` is where the workflow is read from: "repo" or "yours", or left out when only one has a workflow named '${workflow}'.` };
  }
  if (after !== undefined && (!Array.isArray(after) || !after.every((id) => typeof id === 'string' && id.trim() !== ''))) {
    return {
      status: 400,
      error: `\`after\` is the runs this one waits on, by id, as \`wf start --after <runId>\` takes each: a list of run ids, such as \`"after": ["add-a-cache-k2q9"]\`, or left out for a run that waits on none. This request's was ${JSON.stringify(after)}. GET /api/runs lists the runs there are.`,
    };
  }
  if (card !== undefined) {
    if (typeof card !== 'string') {
      return { status: 400, error: `\`card\` names the inbox card to start, as \`wf inbox\` lists it: a name, such as \`"card": "cache-the-views-k2q9"\`, or left out for a run that starts from no card. This request's was ${JSON.stringify(card)}. GET /api/inbox lists the cards.` };
    }
    const refused = inboxNameRefusal(card);
    if (refused) return { status: 400, error: refused };
    if (brief !== undefined && typeof brief !== 'string') {
      return { status: 400, error: `\`brief\` is what the run is asked to do in place of the card's body, as \`wf start <card> --brief "<brief>"\` takes it: text, or left out for the card's body. This request's was ${JSON.stringify(brief)}.` };
    }
  }
  const folder = folderOf(workflow, from, repo, home);
  if ('status' in folder) return folder;
  if (card !== undefined) return { dir: folder.dir, brief: brief as string | undefined, after, card: card as string };
  if (typeof brief !== 'string' || !brief.trim()) {
    return { status: 422, error: `A run needs a brief: what to do, as \`wf start <brief>\` takes it. Write it in \`brief\` — the run's steps are told it, under "What was asked for".` };
  }
  return { dir: folder.dir, brief: brief.trim(), after };
}

/**
 * The status of a card's start that `startFromInbox` refused, in its words (`exitCode` 2): 404 for a card not there — its file gone, so no
 * other refusal can have read it — 409 for one a run's record already names, and 422 for the rest: a card that does not read, a workflow that
 * does not load, a blank brief, and what `start()` refuses.
 */
function cardRefusalStatus(card: string): 404 | 409 | 422 {
  if (!fs.existsSync(path.join(inboxDir(), `${card}.md`))) return 404;
  if (listRuns().some((run) => run.from?.inbox === card)) return 409;
  return 422;
}

export const workflows = new Hono()
  // Read from disk on each request, so a folder a person has just edited lists as it is now.
  .get('/api/workflows', (c) => {
    try {
      return c.json(listWorkflows(repoOf()));
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // One step of one folder, for its page: found among the folders the sources have and the steps the loader read, never joined from what
  // was sent — so no name in the path reaches a file outside the folder — or why not, in the words a start would use.
  .get('/api/workflows/:from/:name/:step', (c) => {
    const { from, name, step } = c.req.param();
    if (from !== 'repo' && from !== 'yours') {
      return c.json({ error: `A step's page names where its workflow is read from: \`repo\` or \`yours\`, as GET /api/workflows lists each workflow's \`from\` — /api/workflows/repo/${name}/${step}, say. This request's was '${from}'.` }, 400);
    }
    try {
      const folder = folderOf(name, from, repoOf(), HOME);
      if ('status' in folder) return c.json({ error: folder.error }, folder.status);
      let steps: Workflow[];
      try {
        steps = loadWorkflows(folder.dir);
      } catch (err) {
        // The loader's refusal, word for word: the folder is listed with it, and has no step to show.
        return c.json({ error: messageOf(err) }, 422);
      }
      const found = steps.find((s) => s.name === step);
      if (!found) {
        return c.json({ error: `No step '${step}' in workflow ${name} (${folder.dir}). Its steps are: ${steps.map((s) => s.name).join(', ')}.` }, 404);
      }
      const source = fs.readFileSync(path.join(folder.dir, `${found.name}.md`), 'utf8');
      // The step's resolved agent carries its keys and words, not its skills: those are read from the agent's own file, beside the folder.
      const attached = found.agent ? loadAgents(agentsDir(folder.dir)).get(found.agent.name) : undefined;
      const agentSkills = attached instanceof Error || attached === undefined ? null : attached.skills?.list ?? null;
      return c.json({ workflow: name, from, dir: folder.dir, step: found.name, body: found.body, source, keys: keyRows(found), agentSkills } satisfies WorkflowStepPage);
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // The repository a start runs in: what the start form lists the runs of, for a run to wait on.
  .get('/api/repository', (c) => c.json({ repo: repoOf() }))
  // The board's first write, and the one a person makes at the command line: `wf start <brief> --workflows <folder> --repo <repo> --after <runId>`,
  // or, with `card`, `wf start <inbox>/<card>.md --brief <brief> --workflows <folder> --after <runId>`.
  .post('/api/runs', async (c) => {
    const refused = refusedBeforeReading(START, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const repo = repoOf();
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: `POST /api/runs takes a JSON body: ${SHAPE}.` }, 400);
    }
    const asked = startOf(body, repo, HOME);
    if ('status' in asked) return c.json({ error: asked.error }, asked.status);
    if (asked.card !== undefined) {
      try {
        // The api's repository is the caller's, as `.` is `wf start`'s: the card's `repo:` is over it. The folder is the one `folderOf` found.
        const started = startFromInbox({ name: asked.card, callerRepo: repo, workflow: asked.dir, ...(asked.brief !== undefined ? { brief: asked.brief } : {}), ...(asked.after ? { after: asked.after } : {}) });
        c.header('Location', `/api/runs/${encodeURIComponent(started.run.id)}`);
        // Started all the same when the card could not be removed: the run is written, and the card lists as started until it is dropped.
        // And a card whose `repo:` the run looked at none of — a folder team's — carries it, as `wf start` prints it and a tick's line
        // says it (`ignoredRepoLine`): a client that starts a card is told the same fact wherever it started from.
        return c.json({
          id: started.run.id, card: started.card.name, removed: started.removed,
          ...(started.removed ? {} : { why: started.why }),
          ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
        }, 201);
      } catch (err) {
        const status = (err as { exitCode?: unknown }).exitCode === 2 ? cardRefusalStatus(asked.card) : 422;
        return c.json({ error: messageOf(err) }, status);
      }
    }
    try {
      const { id } = start({ brief: asked.brief, repo, workflowDir: asked.dir, ...(asked.after ? { after: asked.after } : {}) });
      c.header('Location', `/api/runs/${encodeURIComponent(id)}`);
      return c.json({ id }, 201);
    } catch (err) {
      // `wf start`'s refusal, word for word: a folder that does not read as a workflow, a step named for another's check
      // or try, a `.worktreeinclude` it cannot use, a repository git cannot read, or a run this one cannot wait on (`afterRefusal`).
      return c.json({ error: messageOf(err) }, 422);
    }
  });
