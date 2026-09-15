/**
 * A repository's workflows, for the board: listed, drawn, and started.
 *
 * W in docs/plan-hold-the-bar.md. A workflow is a folder of steps. A repository carries its own checked in, one folder
 * each under `<repo>/workflows/`, and a person keeps their own under `workflows/` in the store the runs are in —
 * `~/.agent-workflows/workflows/`, or under `WF_ROOT` when that is set. Each folder is read with the package's loader,
 * so one `wf start` would refuse is listed with the loader's refusal, never hidden.
 *
 * The start is the package's `start()`, `wf start`'s own: it writes the run's record and files nothing — `wf tick` or
 * `wf up` files the first step, as it does for a run started at the command line. Nothing else here writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { HOME, start } from 'agent-workflows';
import { loadWorkflows, workflowDescription, type Workflow } from 'agent-workflows/workflow';
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
  after: string[];
  resume: string | null;
  input: string[];
  permissionMode: string | null;
  tools: string[] | null;
  /** What the session may not have, in Claude Code's permission rules (`disallow:`): empty where the step denies nothing. */
  disallow: string[];
  deadlineSeconds: number | null;
  maxAttempts: number | null;
  check: string | null;
  retries: number | null;
  /** The schema file `output:` names, beside the step. */
  output: string | null;
  loop: string | null;
  rounds: number | null;
};

/**
 * A workflow as the board lists it. `name` is its folder's. `graph` is `graphOf` its steps, as a run of it would be
 * drawn. `error` is the loader's refusal of a folder that does not read as a workflow, whose `steps` are then none.
 */
export type WorkflowListing = {
  name: string;
  from: WorkflowSource;
  dir: string;
  description: string | null;
  steps: Array<{ name: string; spec: WorkflowStepSpec }>;
  graph: RunGraph;
  error: string | null;
};

/** Where workflows are read from, in the order they are listed: the repository's, then yours. */
export const sourcesOf = (repo: string, home: string = HOME): Array<{ from: WorkflowSource; dir: string }> => [
  { from: 'repo', dir: path.join(repo, 'workflows') },
  { from: 'yours', dir: path.join(home, 'workflows') },
];

/** Every workflow `repo` and `home` have: each folder in each source, by name. Loads every folder, so each can say whether it reads. */
export function listWorkflows(repo: string, home: string = HOME): WorkflowListing[] {
  return sourcesOf(repo, home).flatMap(({ from, dir }) => foldersIn(dir).map((name) => listed(name, from, path.join(dir, name))));
}

function listed(name: string, from: WorkflowSource, dir: string): WorkflowListing {
  const description = workflowDescription(dir);
  let steps: Workflow[];
  try {
    steps = loadWorkflows(dir);
  } catch (err) {
    return { name, from, dir, description, steps: [], graph: graphOf([]), error: messageOf(err) };
  }
  return { name, from, dir, description, steps: steps.map((step) => ({ name: step.name, spec: specOf(step) })), graph: graphOf(steps), error: null };
}

const specOf = (step: Workflow): WorkflowStepSpec => ({
  harness: step.harness ?? null,
  model: step.model ?? null,
  effort: step.effort ?? null,
  after: step.after,
  resume: step.resume ?? null,
  input: step.input ?? [],
  permissionMode: step.permissionMode ?? null,
  tools: step.tools ?? null,
  disallow: step.disallow ?? [],
  deadlineSeconds: step.deadlineSeconds ?? null,
  maxAttempts: step.maxAttempts ?? null,
  check: step.check ?? null,
  retries: step.retries ?? null,
  output: step.output?.file ?? null,
  loop: step.loop ?? null,
  rounds: step.rounds ?? null,
});

/**
 * The folders directly in `dir`, sorted, a link to one included. None when `dir` is not there. A hidden folder is not a
 * workflow — `.git`, where a person keeps their workflows in git, or an editor's `.vscode` — so it is not listed, and no start
 * can name it.
 */
function foldersIn(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException).code ?? '')) return [];
    throw new Error(`${dir} could not be listed (${messageOf(err)}), so no workflow in it is shown. Check its permissions.`);
  }
  return names.filter((name) => {
    if (name.startsWith('.')) return false;
    try {
      return fs.statSync(path.join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  }).sort();
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const SHAPE = '`{ "workflow": "<name>", "brief": "<what to do>" }`, with `"from": "repo"` or `"yours"` when both have a workflow of that name, and `"after": ["<runId>", …]` for the runs it waits on';

/** A start, as the guard's refusals word it (guard.ts). */
const START: Guarded = {
  route: 'POST /api/runs',
  does: 'starts a run',
  forAnother: 'start one',
  why: "a run's brief is what an agent acts on in this repository",
  reach: 'start the run from the board',
  instead: "Start it from the board's Workflows page, or with `wf start`",
  shape: SHAPE,
};

/**
 * The workflow folder a start names, found among the folders the sources have — never joined from what was sent, so no
 * name reaches a folder outside them — or why not: none of that name, or one in each source and no `from` to choose.
 */
function folderOf(name: string, from: WorkflowSource | undefined, repo: string, home: string): { dir: string } | Refusal {
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

/**
 * What `POST /api/runs` starts, or why it does not: the body's shape (400), the workflow it names (404, 409), and the
 * brief (422) — the api's own, since `start()` takes any string and `wf start` prints its help for none.
 *
 * `after` is only shaped here: a list of run ids, as `wf start --after <runId>` takes each, and never a blank one, which the CLI refuses
 * too (`--after=`). Whether this run may wait on each is `start()`'s to say (`afterRefusal`), in its words.
 */
function startOf(body: unknown, repo: string, home: string): { dir: string; brief: string; after: string[] | undefined } | Refusal {
  if (!isObject(body)) return { status: 400, error: `POST /api/runs takes a JSON object: ${SHAPE}.` };
  const { workflow, brief, from, after } = body;
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
  const folder = folderOf(workflow, from, repo, home);
  if ('status' in folder) return folder;
  if (typeof brief !== 'string' || !brief.trim()) {
    return { status: 422, error: `A run needs a brief: what to do, as \`wf start <brief>\` takes it. Write it in \`brief\` — the run's steps are told it, under "What was asked for".` };
  }
  return { dir: folder.dir, brief: brief.trim(), after };
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
  // The repository a start runs in: what the start form lists the runs of, for a run to wait on.
  .get('/api/repository', (c) => c.json({ repo: repoOf() }))
  // The board's first write, and the one a person makes at the command line: `wf start <brief> --workflows <folder> --repo <repo> --after <runId>`.
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
