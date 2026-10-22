/**
 * GET /api/workflows and POST /api/runs (workflows.ts): a repository's workflows listed, and a run of one started, in a
 * scratch store and a scratch repository — and this repository's own workflows, as the board lists them.
 *
 * Beside the scratch repository's workflows lie folders and files that are not one: `NOTES.txt`, not a folder; `.vscode` and `.draft`,
 * hidden, the second with a step in it; and `agents/`, the agents the workflows beside it name, whose files look like steps.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { app, runtime } from '../app.ts';
import { ReadMemo } from '../layer.ts';
import { workflowVersion as versionIn } from 'agent-orchestrator';
import { runWith } from '../../test/placed.ts';
import { listWorkflows } from './workflows.ts';
import {
  engine,
  shippedGitPlace,
  hireRefusalOf,
  loadWorkflows,
  parentRecord,
  passStanding,
  runStore,
  standingLiveOf,
} from 'agent-orchestrator';
import { afterRefusal } from 'agent-orchestrator/run';
import { AGENTS_FOLDER, STEP_KEY_MEANINGS, STEP_KEYS } from 'agent-orchestrator/workflow';
/** The scratch repository, set as `HKB_REPO`, which the api reads on each request: a git repository, as `nemia start` reads its HEAD. */
const repo = scratch('nemia-api-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });

/** A folder's version as the board lists it: its agents and skills looked for in the repository's `.claude/` and in yours too. */
const versionOf = (dir: string): string => versionIn(dir, { repo, home: root });

type WorkflowStepSpec = import('./workflows.ts').WorkflowStepSpec;
type WorkflowStepPage = import('../step/step.ts').WorkflowStepPage;
type WorkflowListing = import('./workflows.ts').WorkflowListing;
type RunSummary = import('agent-orchestrator').RunSummary;
type RunDetail = import('../detail/detail.ts').RunDetail;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const again = JSON.stringify({
  type: 'object',
  properties: { again: { type: 'boolean' } },
  required: ['again'],
  additionalProperties: false,
});

/** implement ⇄ review, described by its README. */
const good = path.join(repo, 'workflows', 'good');
write(path.join(good, 'README.md'), '# good\n\nImplement it, then review it,\ntwo rounds at most.\n\nMore about it.\n');
write(path.join(good, 'implement.md'), '---\nplace: git\nharness: claude\nmodel: opus\ncheck: npm test\n---\nImplement it.\n');
write(
  path.join(good, 'review.md'),
  '---\nplace: git\nharness: claude\nafter: implement\ntools: Read, Grep\npermissionMode: dontAsk\noutput: review.json\nloop: implement\nrounds: 2\n---\nReview it.\n',
);
write(path.join(good, 'review.json'), again);

/** A reviewer whose `after` is misspelt, which the loader refuses by name. */
const broken = path.join(repo, 'workflows', 'broken');
write(path.join(broken, 'README.md'), '# broken\n\nA reviewer with a misspelt key.\n');
write(path.join(broken, 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
write(path.join(broken, 'review.md'), '---\nplace: git\nafer: implement\n---\nReview it.\n');

write(path.join(repo, 'workflows', 'NOTES.txt'), 'Ideas for workflows.\n');
write(path.join(repo, 'workflows', '.vscode', 'settings.json'), '{}\n');
write(path.join(repo, 'workflows', '.draft', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
write(path.join(repo, 'workflows', 'agents', 'implementer.md'), '---\nharness: claude\n---\nImplement what you are asked.\n');

/** Yours, in the store: one step, and no README — kept in git, as a person's own workflows may be. */
const mine = path.join(root, 'workflows', 'mine');
write(path.join(mine, 'plan.md'), '---\nplace: git\nharness: codex\ncheck: test -f PLAN.md\nretries: 1\n---\nWrite PLAN.md.\n');
write(path.join(root, 'workflows', '.git', 'HEAD'), 'ref: refs/heads/main\n');

/** A spec with every key unset but `fields` and the `place: git` every step says. */
const spec = (fields: Partial<WorkflowStepSpec>): WorkflowStepSpec => ({
  harness: null,
  model: null,
  effort: null,
  context: null,
  after: [],
  resume: null,
  input: [],
  place: 'git',
  workspace: null,
  writable: [],
  reads: [],
  slot: null,
  agent: null,
  skills: [],
  mcp: [],
  permissionMode: null,
  sandbox: null,
  tools: null,
  disallowedTools: [],
  allowedTools: [],
  denials: null,
  background: null,
  remote: null,
  deadlineSeconds: null,
  budget: null,
  check: null,
  retries: null,
  gate: null,
  output: null,
  tally: [],
  loop: null,
  rounds: null,
  ...fields,
});

/** What the loader refuses `dir` with. */
const loaderRefusal = (dir: string): string => {
  try {
    loadWorkflows(dir);
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`${dir} loaded, and should have been refused`);
};

const post = (body: unknown) =>
  app.request('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** The files in the store's runs directory: a record per run, and anything else anyone wrote there. */
const runFiles = (): string[] => (fs.existsSync(path.join(root, 'runs')) ? fs.readdirSync(path.join(root, 'runs')).sort() : []);

/** The tasks filed with the engine: a journal each. */
const filedTasks = (): string[] =>
  fs.existsSync(path.join(root, 'engine', 'tasks')) ? fs.readdirSync(path.join(root, 'engine', 'tasks')) : [];

test("GET /api/workflows lists each folder, the repository's then yours: its description, its steps' specs and bodies, its graph and the schemas beside its steps — and a folder the loader refuses, with the refusal and no steps", async () => {
  const res = await app.request('/api/workflows');
  assert.equal(res.status, 200);
  const refused = loaderRefusal(broken);
  assert.match(refused, /review: `afer` is not a key a step has/);

  const listing = (await res.json()) as WorkflowListing[];
  for (const w of listing)
    assert.equal(w.version, versionOf(w.dir), `${w.name}: at the version its files are at, which a save from the board carries`);
  assert.deepEqual(listing, [
    {
      name: 'broken',
      from: 'repo',
      dir: broken,
      description: 'A reviewer with a misspelt key.',
      /** A folder the loader refuses still has its README. */
      readme: '# broken\n\nA reviewer with a misspelt key.\n',
      steps: [],
      graph: { roots: [], edges: [] },
      schemas: [],
      folderTeam: false,
      version: versionOf(broken),
      error: refused,
      unfilled: null,
    },
    {
      name: 'good',
      from: 'repo',
      dir: good,
      description: 'Implement it, then review it, two rounds at most.',
      /** Whole: the paragraphs past the description too. */
      readme: '# good\n\nImplement it, then review it,\ntwo rounds at most.\n\nMore about it.\n',
      /** The README is not among the steps. */
      steps: [
        {
          name: 'implement',
          spec: spec({ harness: 'claude', model: 'opus', check: 'npm test' }),
          body: 'Implement it.',
          own: null,
          hired: null,
          layers: null,
          mcp: [],
        },
        {
          name: 'review',
          spec: spec({
            harness: 'claude',
            after: ['implement'],
            tools: ['Read', 'Grep'],
            permissionMode: 'dontAsk',
            output: 'review.json',
            loop: 'implement',
            rounds: 2,
          }),
          body: 'Review it.',
          own: null,
          /** Listed in the default factory, which hires no one. */
          hired: null,
          layers: null,
          mcp: [],
        },
      ],
      /** `graphOf` the steps, as a run of it is drawn. */
      graph: {
        roots: ['implement'],
        edges: [
          { from: 'implement', to: 'review', kind: 'after' },
          { from: 'review', to: 'implement', kind: 'loop', rounds: 2 },
        ],
      },
      schemas: ['review.json'],
      /** Neither works in folders: a folder team is every step saying `workspace: folder` (folder-run.test.ts lists one). */
      folderTeam: false,
      version: versionOf(good),
      error: null,
      /** Listed in the default factory, whose steps are never unfilled. */
      unfilled: null,
    },
    {
      name: 'mine',
      from: 'yours',
      dir: mine,
      description: null,
      readme: null,
      steps: [
        {
          name: 'plan',
          spec: spec({ harness: 'codex', check: 'test -f PLAN.md', retries: 1 }),
          body: 'Write PLAN.md.',
          own: null,
          hired: null,
          layers: null,
          mcp: [],
        },
      ],
      graph: { roots: ['plan'], edges: [] },
      schemas: [],
      folderTeam: false,
      version: versionOf(mine),
      error: null,
      unfilled: null,
    },
  ]);
});

/** A step's page, as the board asks for it. */
const stepPage = (from: string, name: string, step: string) => app.request(`/api/workflows/${from}/${name}/${step}`);

/** Every key a step may set, in the package's order, with the values `set` gives over the `place: git` every step says, and its meaning. */
const rows = (set: Record<string, string | null>) =>
  STEP_KEYS.map((key) => ({
    key,
    value: ({ place: 'git', ...set } as Record<string, string | null>)[key] ?? null,
    meaning: STEP_KEY_MEANINGS[key],
  }));

/** A folder as it is: each file's name and text, to show a read wrote nothing. */
const filesOf = (dir: string): Array<[string, string]> =>
  fs
    .readdirSync(dir)
    .sort()
    .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);

test("GET /api/workflows/:from/:name/:step is a step's page: which workflow and step, its body, its file as written, and every key a step may set with its value as the loader read it and what it means", async () => {
  const before = [filesOf(good), filesOf(mine)];

  const res = await stepPage('repo', 'good', 'review');
  assert.equal(res.status, 200, await res.clone().text());
  const review = (await res.json()) as WorkflowStepPage;
  assert.deepEqual(
    { ...review, keys: undefined },
    {
      workflow: 'good',
      from: 'repo',
      dir: good,
      step: 'review',
      body: 'Review it.',
      source: fs.readFileSync(path.join(good, 'review.md'), 'utf8'),
      keys: undefined,
      /** This step names no agent, so there is nothing it says it can do; a step whose agent has skills is further down, in this test. */
      agentSkills: null,
      factory: null,
      /** With no agent, its own words are all a run would be told, before a task no run has given yet. */
      layers: {
        agent: null,
        instructions: null,
        custom: null,
        factory: null,
        agentSkills: [],
        policy: 'Review it.',
        addedSkills: [],
        fence: [],
        folderFiles: true,
        task: null,
        via: 'brief',
      },
      hired: null,
      hiredIn: [],
      /** Read in the default factory, which hires no one, so it offers no agent. */
      hiring: { refused: hireRefusalOf(undefined, 'good', null), agents: [] },
      skillsFrom: [],
      recentRuns: [],
    },
  );
  assert.deepEqual(
    review.keys,
    rows({
      after: 'implement',
      harness: 'claude',
      permissionMode: 'dontAsk',
      sandbox: null,
      tools: 'Read, Grep',
      output: 'review.json',
      loop: 'implement',
      rounds: '2',
    }),
  );
  assert.deepEqual(
    review.keys.map((k) => k.key),
    [...STEP_KEYS],
    "in the package's order, set or not",
  );

  const plan = (await (await stepPage('yours', 'mine', 'plan')).json()) as WorkflowStepPage;
  assert.deepEqual(
    [plan.from, plan.dir, plan.body, plan.source],
    ['yours', mine, 'Write PLAN.md.', '---\nplace: git\nharness: codex\ncheck: test -f PLAN.md\nretries: 1\n---\nWrite PLAN.md.\n'],
  );
  assert.deepEqual(
    plan.keys,
    rows({ harness: 'codex', check: 'test -f PLAN.md', retries: '1' }),
    'yours, and a step that sets counts: each in digits',
  );

  write(path.join(mine, 'notes.md'), '---\nplace: git\n---\nTake notes.\n');
  const notes = (await (await stepPage('yours', 'mine', 'notes')).json()) as WorkflowStepPage;
  assert.deepEqual([notes.body, notes.keys], ['Take notes.', rows({})], 'a step that sets nothing but its place: every key, no other set');
  fs.rmSync(path.join(mine, 'notes.md'));

  write(path.join(mine, 'notes.md'), '---\nplace: git\ncontext: 150000\n---\nTake notes.\n');
  const windowed = (await (await stepPage('yours', 'mine', 'notes')).json()) as WorkflowStepPage;
  assert.deepEqual(
    windowed.keys,
    rows({ context: '150k' }),
    "a context window, however the file writes it, in the package's one form — the one `renderStep` writes",
  );
  fs.rmSync(path.join(mine, 'notes.md'));

  const said = [{ id: 'take-notes', name: 'Take notes', description: 'Writes down what was decided.', tags: ['notes', 'writing'] }];
  write(
    path.join(root, 'workflows', AGENTS_FOLDER, 'scribe.md'),
    '---\ndescription: Writes things down.\nskills: take-notes\ntools: Read, Skill\nharness: claude\n---\nWrite it down.\n',
  );
  write(
    path.join(root, 'workflows', 'skills', 'take-notes', 'SKILL.md'),
    '---\nname: take-notes\ntitle: Take notes\ndescription: Writes down what was decided.\ntags: ["notes", "writing"]\n---\nWrite it.\n',
  );
  write(path.join(mine, 'notes.md'), '---\nplace: git\nagent: scribe\n---\nTake notes.\n');
  const attached = (await (await stepPage('yours', 'mine', 'notes')).json()) as WorkflowStepPage;
  assert.deepEqual(
    attached.agentSkills,
    said,
    "a step that names an agent: what that agent says it can do, its card generated from the skills it gives, is on the step's page beside its keys",
  );
  assert.deepEqual(
    attached.keys.find((k) => k.key === 'harness'),
    { key: 'harness', value: 'claude', meaning: STEP_KEY_MEANINGS.harness },
    "the agent's keys are the step's too",
  );
  assert.equal(attached.layers.instructions, 'Write it down.', "what a run would be told first: the agent's instructions, read now");
  assert.deepEqual(
    attached.skillsFrom,
    [{ name: 'take-notes', from: 'yours', foundIn: null }],
    "each skill of its layers, with where it is found: in your library, so its page is yours'",
  );
  write(path.join(mine, 'notes.md'), '---\nplace: git\n---\nTake notes.\n');
  assert.equal(
    ((await (await stepPage('yours', 'mine', 'notes')).json()) as WorkflowStepPage).agentSkills,
    null,
    'the same step with the line taken off: the agent is not named, so the page says nothing it can do',
  );
  fs.rmSync(path.join(mine, 'notes.md'));
  write(path.join(mine, 'notes.md'), '---\nplace: git\nagent: scribe\n---\nTake notes.\n');
  fs.rmSync(path.join(root, 'workflows', 'skills'), { recursive: true });
  const lost = await stepPage('yours', 'mine', 'notes');
  assert.equal(
    ((await lost.json()) as WorkflowStepPage).agentSkills ?? null,
    null,
    'a card that cannot be made — the skill gone — says nothing on the page, and the page is still served',
  );
  fs.rmSync(path.join(mine, 'notes.md'));
  fs.rmSync(path.join(root, 'workflows', AGENTS_FOLDER), { recursive: true });

  assert.deepEqual([filesOf(good), filesOf(mine)], before, 'read, and nothing written');
});

test("REFUSED at shipped defaults: a step's page from somewhere that is not repo or yours (400), for a workflow there is not (404, in a start's words), a folder the loader refuses (422, in its words), and a step the folder does not have (404, naming its steps) — nothing read outside the folder", async () => {
  const from = await stepPage('elsewhere', 'good', 'review');
  assert.equal(from.status, 400);
  assert.match(((await from.json()) as { error: string }).error, /`repo` or `yours`.*This request's was 'elsewhere'\./);

  const unknown = await stepPage('repo', 'nope', 'review');
  assert.equal(unknown.status, 404);
  const { error } = (await unknown.json()) as { error: string };
  assert.ok(error.startsWith("No workflow 'nope' in "), error);
  for (const [where, name] of [
    ['repo', '..%2Fworkflows%2Fgood'],
    ['repo', 'mine'],
    ['yours', 'good'],
    ['repo', '.draft'],
    ['yours', '.git'],
  ]) {
    assert.equal(
      (await stepPage(where, name, 'implement')).status,
      404,
      `${where} ${name}: found among the folders a source has, never joined onto a path; and yours is not the repository's`,
    );
  }

  const broken = await stepPage('repo', 'broken', 'implement');
  assert.equal(broken.status, 422);
  assert.equal(((await broken.json()) as { error: string }).error, loaderRefusal(path.join(repo, 'workflows', 'broken')));

  for (const step of ['nope', 'README', 'review.md', '..%2F..%2Fbroken%2Freview', '..%2Freview.json']) {
    const res = await stepPage('repo', 'good', step);
    assert.equal(res.status, 404, step);
    const said = ((await res.json()) as { error: string }).error;
    assert.ok(said.startsWith(`No step '${decodeURIComponent(step)}' in workflow good (${good}). Its steps are: implement, review.`), said);
    assert.ok(!said.includes('afer') && !said.includes('"again"'), `${step}: nothing of another file`);
  }
});

test('POST /api/runs starts a run of the workflow it names as `nemia start` does: the record is written, and nothing is filed', async () => {
  assert.deepEqual(runFiles(), []);
  const res = await post({ workflow: 'good', brief: 'Add a cache\n\nKeep it small.\n' });
  assert.equal(res.status, 201);
  const { id } = (await res.json()) as { id: string };
  assert.match(id, /^add-a-cache-keep-it-small-[a-z0-9]+$/);
  assert.equal(res.headers.get('location'), `/api/runs/${id}`);

  assert.deepEqual(runFiles(), [`${id}.json`], 'the record, and nothing beside it');
  const run = runStore.runs.read(id);
  assert.deepEqual(
    {
      repo: run.repo,
      workspace: run.workspace,
      workflowDir: run.workflowDir,
      brief: run.brief,
      isolate: run.isolate,
      branch: run.branch,
      steps: run.steps,
    },
    {
      repo,
      workspace: repo,
      workflowDir: good,
      brief: 'Add a cache\n\nKeep it small.',
      isolate: true,
      branch: 'main',
      steps: { implement: { taskId: null }, review: { taskId: null } },
    },
  );
  assert.equal(run.baseRef, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim());
  assert.deepEqual(
    run.workflow?.map((s) => s.name),
    ['implement', 'review'],
    'the workflow frozen on the record',
  );

  assert.deepEqual(filedTasks(), [], "nothing filed: no task in the engine's store — `nemia tick` files the first step");
  assert.equal(fs.existsSync(path.join(root, 'worktrees')), false, 'and no worktree cut');

  const listed = ((await (await app.request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id)!;
  assert.equal(listed.workflowDir, good, 'the board lists it, with the folder it was started from');
  assert.deepEqual(
    listed.steps.map((s) => s.status),
    ['waiting', 'waiting'],
  );
});

test('REFUSED at shipped defaults: an unknown workflow (404, naming the ones there are), a missing or blank brief (422), a body of the wrong shape (400) — and nothing is written', async () => {
  const before = runFiles();

  const unknown = await post({ workflow: 'nope', brief: 'Do it.' });
  assert.equal(unknown.status, 404);
  const { error } = (await unknown.json()) as { error: string };
  assert.ok(error.startsWith("No workflow 'nope' in "), error);
  assert.ok(error.includes('The workflows there are: broken (repo), good (repo), mine (yours).'), error);
  for (const workflow of ['..', 'good/../mine', 'NOTES.txt', '.draft', '.git', '.vscode', 'agents'])
    assert.equal(
      (await post({ workflow, brief: 'Do it.' })).status,
      404,
      `${workflow}: found among the folders, never joined onto a path — \`..\` names none of them, nor does a hidden folder, one with a step in it included, nor \`agents/\`, whose files read as steps`,
    );

  for (const brief of [undefined, '', '  \n', 42]) {
    const res = await post({ workflow: 'good', brief });
    assert.equal(res.status, 422, String(brief));
    assert.ok(((await res.json()) as { error: string }).error.startsWith('A run needs a brief'), String(brief));
  }

  for (const body of ['not json', [], { brief: 'Do it.' }, { workflow: 'good', brief: 'Do it.', from: 'elsewhere' }]) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(((await res.json()) as { error: string }).error, /POST \/api\/runs|`from`/, JSON.stringify(body));
  }

  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test("REFUSED at shipped defaults: a start's `workflow` that is not a name, and a `from` that is neither place, are 400s in the api's words, word for word — and nothing is written", async () => {
  const before = runFiles();
  const shape =
    '`{ "workflow": "<name>", "brief": "<what to do>" }`, with `"from": "repo"` or `"yours"` when both have a workflow of that name, `"after": ["<runId>", …]` for the runs it waits on, `"context": ["<runId>", …]` for the runs it reads as context, and `"card": "<name>"` for an inbox card it starts';
  for (const workflow of ['', 7, null]) {
    const res = await post({ workflow, brief: 'Do it.' });
    assert.equal(res.status, 400, JSON.stringify(workflow));
    assert.equal(
      ((await res.json()) as { error: string }).error,
      `POST /api/runs names the workflow to start in \`workflow\`, a folder's name: ${shape}.`,
    );
  }
  for (const from of ['elsewhere', 7, null]) {
    const res = await post({ workflow: 'good', brief: 'Do it.', from });
    assert.equal(res.status, 400, JSON.stringify(from));
    assert.equal(
      ((await res.json()) as { error: string }).error,
      '`from` is where the workflow is read from: "repo" or "yours", or left out when only one has a workflow named \'good\'.',
    );
  }
  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

/** A start of the repository's `good`, sent with exactly `headers`. */
const sentWith = (headers: Record<string, string>) =>
  app.request('/api/runs', {
    method: 'POST',
    headers,
    body: JSON.stringify({ workflow: 'good', from: 'repo', brief: 'Push main to a new remote.' }),
  });

test("a start as the board sends it is not refused: same-origin through vite's `/api` proxy, which rewrites Host to the api's and leaves the origin header the board's page; and one from a client outside a browser, which sends no Sec-Fetch-Site", async () => {
  const before = runFiles().length;
  for (const headers of [
    { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173', host: '127.0.0.1:8787' },
    { 'content-type': 'application/json; charset=utf-8', host: 'localhost:8787' },
    { 'content-type': 'Application/JSON', host: '[::1]:8787' },
  ] as Array<Record<string, string>>) {
    const res = await sentWith(headers);
    assert.equal(res.status, 201, `${JSON.stringify(headers)}: ${await res.clone().text()}`);
  }
  assert.equal(runFiles().length, before + 3);
});

test("REFUSED at shipped defaults: what `startRun` refuses is a 422 carrying its message word for word — a folder the loader refuses, a step named for another's check — and nothing is written", async () => {
  const before = runFiles();

  const broke = await post({ workflow: 'broken', brief: 'Do it.' });
  assert.equal(broke.status, 422);
  assert.equal(((await broke.json()) as { error: string }).error, loaderRefusal(broken));

  const clash = path.join(root, 'workflows', 'clash');
  write(path.join(clash, 'build.md'), '---\nplace: git\ncheck: npm run build\n---\nBuild it.\n');
  write(path.join(clash, 'build-check.md'), '---\nafter: build\nplace: git\n---\nCheck the build by hand.\n');
  assert.equal(
    (await listWorkflows(engine(), shippedGitPlace, repo, root)).find((w) => w.name === 'clash')?.error,
    null,
    "the loader reads this folder; `nemia start` refuses it, as the run files build's check as `build-check`",
  );
  const res = await post({ workflow: 'clash', brief: 'Do it.' });
  assert.equal(res.status, 422);
  const { error } = (await res.json()) as { error: string };
  assert.ok(error.startsWith("build-check: a step may not be named for another step's check. build has a `check:`"), error);

  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test('REFUSED: a name both the repository and yours have is a 409 until `from` says which, and then starts that one', async () => {
  const yours = path.join(root, 'workflows', 'good');
  write(path.join(yours, 'implement.md'), '---\nplace: git\n---\nImplement it my way.\n');
  const before = runFiles();

  const both = await post({ workflow: 'good', brief: 'Do it.' });
  assert.equal(both.status, 409);
  const { error } = (await both.json()) as { error: string };
  assert.ok(error.includes(`(${good} and ${yours})`), error);
  assert.ok(error.includes('"from": "repo"'), error);
  assert.deepEqual(runFiles(), before);

  const chosen = await post({ workflow: 'good', from: 'yours', brief: 'Do it my way.' });
  assert.equal(chosen.status, 201);
  const run = runStore.runs.read(((await chosen.json()) as { id: string }).id);
  assert.equal(run.workflowDir, yours);
  assert.deepEqual(Object.keys(run.steps), ['implement']);
});

/** A run of the repository's `good` as `nemia start` records one, never filed — and called off, when `cancelledAt` says when. */
function parentRun(id: string, cancelledAt?: string): void {
  if (fs.existsSync(path.join(root, 'runs', `${id}.json`))) return;
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo,
      workspace: repo,
      baseRef: head,
      branch: 'main',
      isolate: true,
      brief: `Run ${id}`,
      workflowDir: good,
      workflow: loadWorkflows(good),
      steps: { implement: { taskId: null }, review: { taskId: null } },
      createdAt: '2026-09-14T00:00:00.000Z',
    }),
  );
  if (cancelledAt) write(path.join(root, 'runs', `${id}.cancelled`), cancelledAt);
}

/** The runs a start below waits on: written by the first test that needs them, since the tests above count the store's files from empty. */
function parents(): void {
  parentRun('p-running');
  parentRun('p-cancelled', '2026-09-14T00:30:00.000Z');
}

test('GET /api/repository is the repository a start runs in, as the start form lists the runs of', async () => {
  const res = await app.request('/api/repository');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { repo });
});

test('POST /api/runs takes `after` and passes it to `startRun`, which freezes it on the record as `nemia start --after` does — and the board reads the run waiting on it', async () => {
  parents();
  const res = await post({ workflow: 'good', from: 'repo', brief: 'Once it ships.', after: ['p-running'] });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = (await res.json()) as { id: string };
  assert.deepEqual(runStore.runs.read(id).after, ['p-running']);
  assert.deepEqual(filedTasks(), [], 'nothing filed');

  const unread = (await (await app.request(`/api/runs/${id}`)).json()) as RunDetail;
  assert.ok(
    unread.waiting?.word.startsWith('waiting on p-running (where it stands is unread: '),
    `no pass has read where p-running stands since it was written: ${unread.waiting?.word}`,
  );
  await runWith(engine(), passStanding(runStore.runs.list()));
  const detail = (await (await app.request(`/api/runs/${id}`)).json()) as RunDetail;
  assert.deepEqual([detail.after, detail.waiting?.word], [['p-running'], 'waiting on p-running']);

  const none = await post({ workflow: 'good', from: 'repo', brief: 'Right away.', after: [] });
  assert.equal(none.status, 201);
  assert.equal(
    Object.hasOwn(runStore.runs.read(((await none.json()) as { id: string }).id), 'after'),
    false,
    'none to wait on is a run that waits on none: a record with no `after`, as `nemia start` writes without one',
  );
});

test('REFUSED at shipped defaults: `after` that is not a list of run ids is a 400, before the workflow is looked for — and nothing is written', async () => {
  const before = runFiles();
  for (const after of ['p-running', {}, null, 42, [1], [null], ['p-running', 7], [''], ['  ']]) {
    const res = await post({ workflow: 'good', from: 'repo', brief: 'Do it.', after });
    assert.equal(res.status, 400, JSON.stringify(after));
    const { error } = (await res.json()) as { error: string };
    assert.ok(
      error.startsWith('`after` is the runs this one waits on, by id, as `nemia start --after <runId>` takes each: a list of run ids'),
      error,
    );
    assert.ok(error.includes(`This request's was ${JSON.stringify(after)}.`), error);
  }
  assert.equal(
    (await post({ workflow: 'nope', brief: 'Do it.', after: 'p-running' })).status,
    400,
    'shaped before the folder is read: a workflow nobody has is not what it is told first',
  );
  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test("REFUSED at shipped defaults: a run `nemia start --after` will not wait on is a 422 carrying `afterRefusal`'s sentence word for word — no such run, a cancelled one, one given twice — and nothing is written", async () => {
  parents();
  const before = runFiles();
  const refusedBy = async (after: string[]): Promise<string> => {
    const res = await post({ workflow: 'good', from: 'repo', brief: 'Wait for it.', after });
    assert.equal(res.status, 422, JSON.stringify(after));
    const { error } = (await res.json()) as { error: string };
    const git = await runWith(engine(), standingLiveOf(after));
    assert.equal(
      error,
      afterRefusal(after, { repo, branch: 'main' }, (id) => parentRecord(id, git)),
      JSON.stringify(after),
    );
    return error;
  };
  assert.equal(
    await refusedBy(['no-such-run']),
    '--after no-such-run: the store has no run no-such-run. --after takes a run this one waits on, by its id — nemia ls lists them.',
  );
  assert.equal(
    await refusedBy(['p-running', 'p-cancelled']),
    '--after p-cancelled: p-cancelled was cancelled at 2026-09-14T00:30:00.000Z, and a cancelled run never ships, so this run would wait for ever. Start it without --after p-cancelled.',
  );
  assert.equal(
    await refusedBy(['p-running', 'p-running']),
    '--after p-running is given twice, and a run waits on another once. Give each run one --after.',
  );
  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test('POST /api/runs takes `context` and passes it to `start()`, which freezes it on the record as `nemia start --from` does, and files at once: it waits on none', async () => {
  parents();
  const res = await post({ workflow: 'good', from: 'repo', brief: 'Read it.', context: ['p-running'] });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = (await res.json()) as { id: string };
  assert.deepEqual([runStore.runs.read(id).context, runStore.runs.read(id).after], [['p-running'], undefined]);
  const detail = (await (await app.request(`/api/runs/${id}`)).json()) as RunDetail;
  assert.deepEqual([detail.context, detail.after, detail.waiting], [['p-running'], [], null]);
});

test('REFUSED at shipped defaults: `context` with a blank run id is a 422 naming the key, and one the store does not have a 404 in `nemia start --from` words — and nothing is written', async () => {
  parents();
  const before = runFiles();
  for (const context of [[''], ['p-running', '  ']]) {
    const res = await post({ workflow: 'good', from: 'repo', brief: 'Read it.', context });
    assert.equal(res.status, 422, JSON.stringify(context));
    const { error } = (await res.json()) as { error: string };
    assert.ok(
      error.startsWith('`context` is the runs this one is handed as context, by id, as `nemia start --from <runId>` takes each'),
      error,
    );
  }
  const missing = await post({ workflow: 'good', from: 'repo', brief: 'Read it.', context: ['no-such-run'] });
  assert.equal(missing.status, 404);
  assert.equal(
    ((await missing.json()) as { error: string }).error,
    '--from no-such-run: the store has no run no-such-run. --from takes a run by its id — nemia ls lists them.',
  );
  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test("a step that names a server its agent does not is listed with its own line in `spec.mcp`, and in `mcp` what its sessions load: the agent's, then its own", async (t) => {
  const dir = path.join(repo, 'workflows', 'served');
  write(path.join(dir, 'look.md'), '---\nplace: git\nagent: looker\nmcp: docs, browser\n---\nLook.\n');
  write(path.join(dir, 'plain.md'), '---\nplace: git\nagent: looker\n---\nLook.\n');
  write(path.join(repo, 'workflows', 'agents', 'looker.md'), '---\nharness: claude\nmcp: browser\n---\nYou look.\n');
  t.after(() => {
    fs.rmSync(dir, { recursive: true });
    fs.rmSync(path.join(repo, 'workflows', 'agents', 'looker.md'));
  });
  const listed = ((await (await app.request('/api/workflows')).json()) as WorkflowListing[]).find((w) => w.name === 'served');
  const of = (name: string) => listed?.steps.find((step) => step.name === name);
  assert.deepEqual(
    [of('look')?.spec.mcp, of('look')?.mcp],
    [
      ['docs', 'browser'],
      ['browser', 'docs'],
    ],
  );
  assert.deepEqual([of('plain')?.spec.mcp, of('plain')?.mcp], [[], ['browser']], "the agent's alone is no line of the step");
});

test("a step's page reads its recent runs off the app's memo: a run whose record has not moved is answered from it, and one written since is on the page", async () => {
  const runs = path.join(root, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const record = (id: string, at: string, dir = good) => ({
    id,
    workspace: root,
    brief: `the brief of ${id}`,
    workflowDir: dir,
    place: { kind: 'folder' },
    steps: { review: { taskId: `${id}-review` } },
    createdAt: at,
  });
  const put = (id: string, at: string, dir?: string) =>
    fs.writeFileSync(path.join(runs, `${id}.json`), JSON.stringify(record(id, at, dir)));
  put('r-of-good', '2099-10-16T00:00:00.000Z');

  const { records } = await runtime.runPromise(ReadMemo.useSync((memo) => memo));
  const cold = (await (await stepPage('repo', 'good', 'review')).json()) as WorkflowStepPage;
  assert.ok(
    cold.recentRuns.some((r) => r.id === 'r-of-good'),
    `the fixture run is on the page: ${cold.recentRuns.map((r) => r.id).join(', ')}`,
  );
  assert.ok(records.step.runs.has('r-of-good'), "the page's read went through the app's memo, which now holds the run");

  put('r-since', '2099-10-16T01:00:00.000Z');
  const warm = (await (await stepPage('repo', 'good', 'review')).json()) as WorkflowStepPage;
  assert.deepEqual(
    warm.recentRuns.map((r) => r.id).slice(0, 2),
    ['r-since', 'r-of-good'],
    'a run written since the last read is on the page, and the one before it is answered from the memo',
  );
  assert.deepEqual({ ...warm, recentRuns: cold.recentRuns }, cold, 'and nothing else the page shows changed');
});
