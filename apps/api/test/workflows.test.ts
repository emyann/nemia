/**
 * GET /api/workflows and POST /api/runs (workflows.ts): a repository's workflows listed, and a run of one started, in a
 * scratch store and a scratch repository — and this repository's own workflows, as the board lists them.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory first. The api reads the
// repository from HKB_REPO on each request: a git repository, since `wf start` reads its HEAD.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-workflows-'));
process.env.WF_ROOT = root;
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-repo-'));
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });

const { app } = await import('../src/app.ts');
const { listWorkflows, versionOf } = await import('../src/workflows.ts');
const { HOME_REPO } = await import('../src/capabilities.ts');
const { parentRecord, readRun } = await import('agent-workflows');
const { afterRefusal } = await import('agent-workflows/run');
const { isReadme, loadWorkflows, STEP_KEY_MEANINGS, STEP_KEYS } = await import('agent-workflows/workflow');
type WorkflowStepSpec = import('../src/workflows.ts').WorkflowStepSpec;
type WorkflowStepPage = import('../src/workflows.ts').WorkflowStepPage;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const again = JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false });

/** implement ⇄ review, described by its README. */
const good = path.join(repo, 'workflows', 'good');
write(path.join(good, 'README.md'), '# good\n\nImplement it, then review it,\ntwo rounds at most.\n\nMore about it.\n');
write(path.join(good, 'implement.md'), '---\nharness: claude\nmodel: opus\ncheck: npm test\n---\nImplement it.\n');
write(path.join(good, 'review.md'), '---\nharness: claude\nafter: implement\ntools: Read, Grep\npermissionMode: dontAsk\noutput: review.json\nloop: implement\nrounds: 2\n---\nReview it.\n');
write(path.join(good, 'review.json'), again);

/** A reviewer whose `after` is misspelt, which the loader refuses by name. */
const broken = path.join(repo, 'workflows', 'broken');
write(path.join(broken, 'README.md'), '# broken\n\nA reviewer with a misspelt key.\n');
write(path.join(broken, 'implement.md'), 'Implement it.\n');
write(path.join(broken, 'review.md'), '---\nafer: implement\n---\nReview it.\n');

// Not a folder, so not a workflow.
write(path.join(repo, 'workflows', 'NOTES.txt'), 'Ideas for workflows.\n');
// Hidden, so not a workflow either: an editor's folder, and one that even has a step in it.
write(path.join(repo, 'workflows', '.vscode', 'settings.json'), '{}\n');
write(path.join(repo, 'workflows', '.draft', 'implement.md'), 'Implement it.\n');
// The agents the workflows beside it name: files that look like steps, and not a workflow.
write(path.join(repo, 'workflows', 'agents', 'implementer.md'), '---\nharness: claude\n---\nImplement what you are asked.\n');

/** Yours, in the store: one step, and no README — kept in git, as a person's own workflows may be. */
const mine = path.join(root, 'workflows', 'mine');
write(path.join(mine, 'plan.md'), '---\nharness: codex\ncheck: test -f PLAN.md\nretries: 1\n---\nWrite PLAN.md.\n');
write(path.join(root, 'workflows', '.git', 'HEAD'), 'ref: refs/heads/main\n');

/** A spec with every key unset but `fields`. */
const spec = (fields: Partial<WorkflowStepSpec>): WorkflowStepSpec => ({
  harness: null, model: null, effort: null, context: null, after: [], resume: null, input: [], workspace: null, slot: null, agent: null, permissionMode: null, tools: null, disallow: [], remote: null,
  deadlineSeconds: null, maxAttempts: null, budget: null, check: null, retries: null, gate: null, output: null, loop: null, rounds: null, ...fields,
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
  app.request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** The files in the store's runs directory: a record per run, and anything else anyone wrote there. */
const runFiles = (): string[] => (fs.existsSync(path.join(root, 'runs')) ? fs.readdirSync(path.join(root, 'runs')).sort() : []);

/** The tasks filed with the engine: a journal each. */
const filedTasks = (): string[] => (fs.existsSync(path.join(root, 'engine', 'tasks')) ? fs.readdirSync(path.join(root, 'engine', 'tasks')) : []);

test("GET /api/workflows lists each folder, the repository's then yours: its description, its steps' specs and bodies, its graph and the schemas beside its steps — and a folder the loader refuses, with the refusal and no steps", async () => {
  const res = await app.request('/api/workflows');
  assert.equal(res.status, 200);
  const refused = loaderRefusal(broken);
  assert.match(refused, /review: `afer` is not a key a step has/);

  const listing = await res.json();
  // Each at the version its files are at: what a save from the board carries.
  for (const w of listing) assert.equal(w.version, versionOf(w.dir), w.name);
  assert.deepEqual(listing, [
    { name: 'broken', from: 'repo', dir: broken, description: 'A reviewer with a misspelt key.', steps: [], graph: { roots: [], edges: [] }, schemas: [], version: versionOf(broken), error: refused },
    {
      name: 'good', from: 'repo', dir: good, description: 'Implement it, then review it, two rounds at most.',
      // The README is not among the steps.
      steps: [
        { name: 'implement', spec: spec({ harness: 'claude', model: 'opus', check: 'npm test' }), body: 'Implement it.', own: null },
        { name: 'review', spec: spec({ harness: 'claude', after: ['implement'], tools: ['Read', 'Grep'], permissionMode: 'dontAsk', output: 'review.json', loop: 'implement', rounds: 2 }), body: 'Review it.', own: null },
      ],
      // `graphOf` the steps, as a run of it is drawn.
      graph: { roots: ['implement'], edges: [{ from: 'implement', to: 'review', kind: 'after' }, { from: 'review', to: 'implement', kind: 'loop', rounds: 2 }] },
      schemas: ['review.json'],
      version: versionOf(good),
      error: null,
    },
    {
      name: 'mine', from: 'yours', dir: mine, description: null,
      steps: [{ name: 'plan', spec: spec({ harness: 'codex', check: 'test -f PLAN.md', retries: 1 }), body: 'Write PLAN.md.', own: null }],
      graph: { roots: ['plan'], edges: [] },
      schemas: [],
      version: versionOf(mine),
      error: null,
    },
  ]);
});

/** A step's page, as the board asks for it. */
const stepPage = (from: string, name: string, step: string) => app.request(`/api/workflows/${from}/${name}/${step}`);

/** Every key a step may set, in the package's order, with the values `set` gives and the package's line of meaning. */
const rows = (set: Record<string, string>) => STEP_KEYS.map((key) => ({ key, value: set[key] ?? null, meaning: STEP_KEY_MEANINGS[key] }));

/** A folder as it is: each file's name and text, to show a read wrote nothing. */
const filesOf = (dir: string): Array<[string, string]> => fs.readdirSync(dir).sort().map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);

test("GET /api/workflows/:from/:name/:step is a step's page: which workflow and step, its body, its file as written, and every key a step may set with its value as the loader read it and what it means", async () => {
  const before = [filesOf(good), filesOf(mine)];

  const res = await stepPage('repo', 'good', 'review');
  assert.equal(res.status, 200, await res.clone().text());
  const review: WorkflowStepPage = await res.json();
  assert.deepEqual({ ...review, keys: undefined }, {
    workflow: 'good', from: 'repo', dir: good, step: 'review', body: 'Review it.',
    source: fs.readFileSync(path.join(good, 'review.md'), 'utf8'), keys: undefined,
  });
  assert.deepEqual(review.keys, rows({ after: 'implement', harness: 'claude', permissionMode: 'dontAsk', tools: 'Read, Grep', output: 'review.json', loop: 'implement', rounds: '2' }));
  assert.deepEqual(review.keys.map((k) => k.key), [...STEP_KEYS], "in the package's order, set or not");

  // Yours, and a step that sets counts: each in digits.
  const plan: WorkflowStepPage = await (await stepPage('yours', 'mine', 'plan')).json();
  assert.deepEqual([plan.from, plan.dir, plan.body, plan.source], ['yours', mine, 'Write PLAN.md.', '---\nharness: codex\ncheck: test -f PLAN.md\nretries: 1\n---\nWrite PLAN.md.\n']);
  assert.deepEqual(plan.keys, rows({ harness: 'codex', check: 'test -f PLAN.md', retries: '1' }));

  // A step that sets nothing: every key, none set.
  write(path.join(mine, 'notes.md'), 'Take notes.\n');
  const notes: WorkflowStepPage = await (await stepPage('yours', 'mine', 'notes')).json();
  assert.deepEqual([notes.body, notes.keys], ['Take notes.', rows({})]);
  fs.rmSync(path.join(mine, 'notes.md'));

  // A context window, however the file writes it, in the package's one form — the one `renderStep` writes.
  write(path.join(mine, 'notes.md'), '---\ncontext: 150000\n---\nTake notes.\n');
  const windowed: WorkflowStepPage = await (await stepPage('yours', 'mine', 'notes')).json();
  assert.deepEqual(windowed.keys, rows({ context: '150k' }));
  fs.rmSync(path.join(mine, 'notes.md'));

  assert.deepEqual([filesOf(good), filesOf(mine)], before, 'read, and nothing written');
});

test("REFUSED at shipped defaults: a step's page from somewhere that is not repo or yours (400), for a workflow there is not (404, in a start's words), a folder the loader refuses (422, in its words), and a step the folder does not have (404, naming its steps) — nothing read outside the folder", async () => {
  const from = await stepPage('elsewhere', 'good', 'review');
  assert.equal(from.status, 400);
  assert.match((await from.json()).error, /`repo` or `yours`.*This request's was 'elsewhere'\./);

  const unknown = await stepPage('repo', 'nope', 'review');
  assert.equal(unknown.status, 404);
  const { error } = await unknown.json();
  assert.ok(error.startsWith("No workflow 'nope' in "), error);
  // Found among the folders a source has, never joined onto a path; and yours is not the repository's.
  for (const [where, name] of [['repo', '..%2Fworkflows%2Fgood'], ['repo', 'mine'], ['yours', 'good'], ['repo', '.draft'], ['yours', '.git']]) {
    assert.equal((await stepPage(where!, name!, 'implement')).status, 404, `${where} ${name}`);
  }

  const broken = await stepPage('repo', 'broken', 'implement');
  assert.equal(broken.status, 422);
  assert.equal((await broken.json()).error, loaderRefusal(path.join(repo, 'workflows', 'broken')));

  for (const step of ['nope', 'README', 'review.md', '..%2F..%2Fbroken%2Freview', '..%2Freview.json']) {
    const res = await stepPage('repo', 'good', step);
    assert.equal(res.status, 404, step);
    const said = (await res.json()).error as string;
    assert.ok(said.startsWith(`No step '${decodeURIComponent(step)}' in workflow good (${good}). Its steps are: implement, review.`), said);
    assert.ok(!said.includes('afer') && !said.includes('"again"'), `${step}: nothing of another file`);
  }
});

test('POST /api/runs starts a run of the workflow it names as `wf start` does: the record is written, and nothing is filed', async () => {
  assert.deepEqual(runFiles(), []);
  const res = await post({ workflow: 'good', brief: 'Add a cache\n\nKeep it small.\n' });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.match(id, /^add-a-cache-keep-it-small-[a-z0-9]+$/);
  assert.equal(res.headers.get('location'), `/api/runs/${id}`);

  assert.deepEqual(runFiles(), [`${id}.json`], 'the record, and nothing beside it');
  const run = readRun(id);
  assert.deepEqual(
    { repo: run.repo, workspace: run.workspace, workflowDir: run.workflowDir, brief: run.brief, isolate: run.isolate, branch: run.branch, steps: run.steps },
    { repo, workspace: repo, workflowDir: good, brief: 'Add a cache\n\nKeep it small.', isolate: true, branch: 'main', steps: { implement: { taskId: null }, review: { taskId: null } } },
  );
  assert.equal(run.baseRef, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim());
  assert.deepEqual(run.workflow?.map((s) => s.name), ['implement', 'review'], 'the workflow frozen on the record');

  // Nothing filed: no task in the engine's store, and no worktree cut. `wf tick` files the first step.
  assert.deepEqual(filedTasks(), []);
  assert.equal(fs.existsSync(path.join(root, 'worktrees')), false);

  // The board lists it, with the folder it was started from.
  const listed = (await (await app.request('/api/runs')).json()).find((r: { id: string }) => r.id === id);
  assert.equal(listed.workflowDir, good);
  assert.deepEqual(listed.steps.map((s: { status: string }) => s.status), ['waiting', 'waiting']);
});

test('REFUSED at shipped defaults: an unknown workflow (404, naming the ones there are), a missing or blank brief (422), a body of the wrong shape (400) — and nothing is written', async () => {
  const before = runFiles();

  const unknown = await post({ workflow: 'nope', brief: 'Do it.' });
  assert.equal(unknown.status, 404);
  const { error } = await unknown.json();
  assert.ok(error.startsWith("No workflow 'nope' in "), error);
  assert.ok(error.includes('The workflows there are: broken (repo), good (repo), mine (yours).'), error);
  // Found among the folders, never joined onto a path: `..` names none of them. Nor does a hidden folder, one with a step in it included,
  // nor `agents/`, whose files read as steps.
  for (const workflow of ['..', 'good/../mine', 'NOTES.txt', '.draft', '.git', '.vscode', 'agents']) assert.equal((await post({ workflow, brief: 'Do it.' })).status, 404, workflow);

  for (const brief of [undefined, '', '  \n', 42]) {
    const res = await post({ workflow: 'good', brief });
    assert.equal(res.status, 422, String(brief));
    assert.ok((await res.json()).error.startsWith('A run needs a brief'), String(brief));
  }

  for (const body of ['not json', [], { brief: 'Do it.' }, { workflow: 'good', brief: 'Do it.', from: 'elsewhere' }]) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match((await res.json()).error, /POST \/api\/runs|`from`/, JSON.stringify(body));
  }

  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

/** A start of the repository's `good`, sent with exactly `headers`. */
const sentWith = (headers: Record<string, string>) =>
  app.request('/api/runs', { method: 'POST', headers, body: JSON.stringify({ workflow: 'good', from: 'repo', brief: 'Push main to a new remote.' }) });

test('REFUSED at shipped defaults: a start another site could make — a body not sent as application/json (415), a page on another site (403), a name that is not this machine (403) — and nothing is written', async () => {
  const before = runFiles();

  // What `fetch(url, { method: 'POST', body })` sends from any page, which the browser does not ask the api about first; a form's; and a near miss.
  for (const type of ['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp']) {
    const res = await sentWith({ 'content-type': type });
    assert.equal(res.status, 415, type);
    const { error } = await res.json();
    assert.ok(error.startsWith(`POST /api/runs takes its body as \`content-type: application/json\`, and this request sent \`${type.split(';')[0]}\``), error);
  }

  // The browser's word on who made the request, which no page can set: anything but the board's own origin. Another port on localhost is `same-site`.
  for (const site of ['cross-site', 'same-site', 'none']) {
    const res = await sentWith({ 'content-type': 'application/json', 'sec-fetch-site': site });
    assert.equal(res.status, 403, site);
    const { error } = await res.json();
    assert.ok(error.startsWith('POST /api/runs refuses a request made by a page on another site') && error.includes(`(Sec-Fetch-Site: ${site})`), error);
  }

  // A site whose name was pointed at 127.0.0.1 is its own origin to the browser, so same-origin; only its Host says where it thinks it is.
  for (const host of ['evil.example', 'evil.example:8787', '172.23.196.168:8787', 'localhost.evil.example:8787']) {
    const res = await sentWith({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', host });
    assert.equal(res.status, 403, host);
    const { error } = await res.json();
    assert.ok(error.startsWith(`POST /api/runs refuses a request addressed to ${host}:`), error);
  }

  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test("a start as the board sends it is not refused: same-origin through vite's proxy, which rewrites Host to the api's; and one from a client outside a browser, which sends no Sec-Fetch-Site", async () => {
  const before = runFiles().length;
  for (const headers of [
    // vite's `/api` proxy sets changeOrigin: Origin is the board's page, Host the api's.
    { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173', host: '127.0.0.1:8787' },
    { 'content-type': 'application/json; charset=utf-8', host: 'localhost:8787' },
    { 'content-type': 'Application/JSON', host: '[::1]:8787' },
  ]) {
    const res = await sentWith(headers);
    assert.equal(res.status, 201, `${JSON.stringify(headers)}: ${await res.clone().text()}`);
  }
  assert.equal(runFiles().length, before + 3);
});

test("REFUSED at shipped defaults: what `start()` refuses is a 422 carrying its message word for word — a folder the loader refuses, a step named for another's check — and nothing is written", async () => {
  const before = runFiles();

  const broke = await post({ workflow: 'broken', brief: 'Do it.' });
  assert.equal(broke.status, 422);
  assert.equal((await broke.json()).error, loaderRefusal(broken));

  // The loader reads this folder; `wf start` refuses it, since the run files build's check as `build-check`.
  const clash = path.join(root, 'workflows', 'clash');
  write(path.join(clash, 'build.md'), '---\ncheck: npm run build\n---\nBuild it.\n');
  write(path.join(clash, 'build-check.md'), '---\nafter: build\n---\nCheck the build by hand.\n');
  assert.equal(listWorkflows(repo, root).find((w) => w.name === 'clash')?.error, null);
  const res = await post({ workflow: 'clash', brief: 'Do it.' });
  assert.equal(res.status, 422);
  const { error } = await res.json();
  assert.ok(error.startsWith("build-check: a step may not be named for another step's check. build has a `check:`"), error);

  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test('REFUSED: a name both the repository and yours have is a 409 until `from` says which, and then starts that one', async () => {
  const yours = path.join(root, 'workflows', 'good');
  write(path.join(yours, 'implement.md'), 'Implement it my way.\n');
  const before = runFiles();

  const both = await post({ workflow: 'good', brief: 'Do it.' });
  assert.equal(both.status, 409);
  const { error } = await both.json();
  assert.ok(error.includes(`(${good} and ${yours})`), error);
  assert.ok(error.includes('"from": "repo"'), error);
  assert.deepEqual(runFiles(), before);

  const chosen = await post({ workflow: 'good', from: 'yours', brief: 'Do it my way.' });
  assert.equal(chosen.status, 201);
  const run = readRun((await chosen.json()).id);
  assert.equal(run.workflowDir, yours);
  assert.deepEqual(Object.keys(run.steps), ['implement']);
});

test("this repository's workflows read as workflows: dev and dev-build are implement ⇄ review → ship with the package's reviewer on Claude, and ui is the package's, copied", () => {
  const listed = listWorkflows(HOME_REPO, fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-no-yours-')));
  for (const name of ['dev', 'dev-build', 'ui']) assert.ok(listed.some((w) => w.name === name), `workflows/${name} is listed`);
  // Every workflow the repository carries reads, with a description: a folder `wf start` would refuse fails here.
  for (const w of listed) {
    assert.equal(w.error, null, `workflows/${w.name}`);
    assert.ok(w.description, `workflows/${w.name} has a README with a description`);
  }

  const shipped = path.join(HOME_REPO, 'packages', 'agent-workflows', 'workflows');
  const reviewer = loadWorkflows(shipped).find((s) => s.name === 'review')!;
  // dev's check: the suite and the types, then the build and the e2e when, and only when, git says the work touched the web app
  // (packages/agent-workflows/test/web-check.test.ts runs it against real git). dev-build's runs them whatever was touched.
  const devCheck = "npm test && npm run typecheck && { if [ -n \"${WF_BASE_REF:-}\" ]; then range=\"$WF_BASE_REF...HEAD\"; else range=HEAD...MERGE_HEAD; fi; touched=$(git diff --name-only \"$range\" --) || { echo \"wf check: cannot tell what the work touched, since git diff --name-only $range failed; the build and the e2e are not skipped on a guess\" >&2; false; }; } && if printf '%s\\n' \"$touched\" | grep -Eq '^(apps/(web|api)/|package(-lock)?\\.json$|turbo\\.json$)'; then npm run build && npm run e2e; else echo \"wf check: nothing under apps/web/ or apps/api/, nor the root's package.json, package-lock.json or turbo.json, was touched: no build, no e2e\"; fi";
  for (const [name, check] of [['dev', devCheck], ['dev-build', 'npm test && npm run typecheck && npm run build && npm run e2e']] as const) {
    const w = listed.find((x) => x.name === name)!;
    // Each step with its body as the loader read it, which the builder puts back.
    assert.deepEqual(w.steps.map((s) => s.body), loadWorkflows(w.dir).map((s) => s.body), name);
    assert.deepEqual(w.steps.map(({ name: step, spec: keys }) => ({ name: step, spec: keys })), [
      // Denied by name what no step needs and an unattended session otherwise has.
      { name: 'implement', spec: spec({ agent: 'implementer', harness: 'claude', model: 'opus', effort: 'high', context: 200_000, check, disallow: ['SendMessage', 'CronCreate', 'CronDelete', 'RemoteTrigger'] }) },
      {
        name: 'review',
        spec: spec({ agent: 'reviewer', harness: 'claude', model: 'opus', effort: 'high', context: 200_000, after: ['implement'], tools: ['Read', 'Grep', 'Glob', 'Bash', 'Skill', 'WebFetch', 'WebSearch'], disallow: ['Bash(npm run build)', 'Bash(npm run e2e)'], permissionMode: 'dontAsk', budget: 20, output: 'review.schema.json', loop: 'implement', rounds: 3 }),
      },
      // The run's ending, gated: it merges in the repository's own checkout, which is why it has no check of its own.
      { name: 'ship', spec: spec({ agent: 'shipper', harness: 'claude', model: 'opus', effort: 'medium', context: 200_000, after: ['review'], workspace: 'main', gate: true, disallow: ['SendMessage', 'CronCreate', 'CronDelete', 'RemoteTrigger'] }) },
    ], name);
    const review = loadWorkflows(w.dir).find((s) => s.name === 'review')!;
    assert.ok(review.body.startsWith(`${reviewer.body}\n\n`), `${name}/review.md is the package's review body, then more`);
    for (const said of [/`npm test` and `npm run typecheck`/, /`npx turbo run test --filter=<package>`/, /`cd packages\/<package> && node --test /, /`git diff`, `git log`, `git show`, `git status`/, /Do not run `npm run build` or `npm run e2e`: they write\s+into the workspace\./]) {
      assert.match(review.body, said, `${name}/review.md says which commands it may run`);
    }
    assert.deepEqual(review.output?.schema, reviewer.output?.schema, `${name}/review.schema.json is the package's, \`again\` and all`);
  }

  const files = (dir: string) => fs.readdirSync(dir).filter((f) => !isReadme(f)).sort();
  const ui = path.join(HOME_REPO, 'workflows', 'ui');
  assert.deepEqual(files(ui), files(path.join(shipped, 'ui')));
  for (const f of files(ui)) assert.equal(fs.readFileSync(path.join(ui, f), 'utf8'), fs.readFileSync(path.join(shipped, 'ui', f), 'utf8'), `workflows/ui/${f} is the package's`);
});

// ─── a run that waits on a run ──────────────────────────────────────────────

/** A run of the repository's `good` as `wf start` records one, never filed — and called off, when `cancelledAt` says when. */
function parentRun(id: string, cancelledAt?: string): void {
  if (fs.existsSync(path.join(root, 'runs', `${id}.json`))) return;
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify({
    id, repo, workspace: repo, baseRef: head, branch: 'main', isolate: true, brief: `Run ${id}`, workflowDir: good, workflow: loadWorkflows(good),
    steps: { implement: { taskId: null }, review: { taskId: null } }, createdAt: '2026-09-14T00:00:00.000Z',
  }));
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

test('POST /api/runs takes `after` and passes it to `start()`, which freezes it on the record as `wf start --after` does — and the board reads the run waiting on it', async () => {
  parents();
  const res = await post({ workflow: 'good', from: 'repo', brief: 'Once it ships.', after: ['p-running'] });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = await res.json();
  assert.deepEqual(readRun(id).after, ['p-running']);
  assert.deepEqual(filedTasks(), [], 'nothing filed');

  const detail = await (await app.request(`/api/runs/${id}`)).json();
  assert.deepEqual([detail.after, detail.waiting?.word], [['p-running'], 'waiting on p-running']);

  // None to wait on is a run that waits on none: the record `wf start` wrote before there was an `after`.
  const none = await post({ workflow: 'good', from: 'repo', brief: 'Right away.', after: [] });
  assert.equal(none.status, 201);
  assert.equal(Object.hasOwn(readRun((await none.json()).id), 'after'), false);
});

test('REFUSED at shipped defaults: `after` that is not a list of run ids is a 400, before the workflow is looked for — and nothing is written', async () => {
  const before = runFiles();
  for (const after of ['p-running', {}, null, 42, [1], [null], ['p-running', 7], [''], ['  ']]) {
    const res = await post({ workflow: 'good', from: 'repo', brief: 'Do it.', after });
    assert.equal(res.status, 400, JSON.stringify(after));
    const { error } = await res.json();
    assert.ok(error.startsWith('`after` is the runs this one waits on, by id, as `wf start --after <runId>` takes each: a list of run ids'), error);
    assert.ok(error.includes(`This request's was ${JSON.stringify(after)}.`), error);
  }
  // Shaped before the folder is read: a workflow nobody has is not what it is told first.
  assert.equal((await post({ workflow: 'nope', brief: 'Do it.', after: 'p-running' })).status, 400);
  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test("REFUSED at shipped defaults: a run `wf start --after` will not wait on is a 422 carrying `afterRefusal`'s sentence word for word — no such run, a cancelled one, one given twice — and nothing is written", async () => {
  parents();
  const before = runFiles();
  const refusedBy = async (after: string[]): Promise<string> => {
    const res = await post({ workflow: 'good', from: 'repo', brief: 'Wait for it.', after });
    assert.equal(res.status, 422, JSON.stringify(after));
    const { error } = await res.json();
    assert.equal(error, afterRefusal(after, { repo, branch: 'main' }, parentRecord), JSON.stringify(after));
    return error;
  };
  assert.equal(await refusedBy(['no-such-run']), '--after no-such-run: the store has no run no-such-run. --after takes a run this one waits on, by its id — wf ls lists them.');
  assert.equal(
    await refusedBy(['p-running', 'p-cancelled']),
    '--after p-cancelled: p-cancelled was cancelled at 2026-09-14T00:30:00.000Z, and a cancelled run never ships, so this run would wait for ever. Start it without --after p-cancelled.',
  );
  assert.equal(await refusedBy(['p-running', 'p-running']), '--after p-running is given twice, and a run waits on another once. Give each run one --after.');
  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});

test('REFUSED at shipped defaults: a start with `after` that another site could make is refused by the guard before its body is read — and nothing is written', async () => {
  parents();
  const before = runFiles();
  const body = JSON.stringify({ workflow: 'good', from: 'repo', brief: 'Wait for it.', after: ['p-running'] });
  const sent = (headers: Record<string, string>) => app.request('/api/runs', { method: 'POST', headers, body });
  const site = await sent({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
  assert.equal(site.status, 403);
  assert.ok((await site.json()).error.startsWith('POST /api/runs refuses a request made by a page on another site'));
  const host = await sent({ 'content-type': 'application/json', host: 'evil.example:8787' });
  assert.equal(host.status, 403);
  assert.ok((await host.json()).error.startsWith('POST /api/runs refuses a request addressed to evil.example:8787'));
  const type = await sent({ 'content-type': 'text/plain;charset=UTF-8' });
  assert.equal(type.status, 415);
  assert.ok((await type.json()).error.includes('`"after": ["<runId>", …]`'), 'the shape it takes names `after`');
  assert.deepEqual(runFiles(), before);
  assert.deepEqual(filedTasks(), []);
});
