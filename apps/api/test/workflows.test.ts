/**
 * GET /api/workflows and POST /api/runs (workflows.ts): a repository's workflows listed, and a run of one started, in a
 * scratch store and a scratch repository — and this repository's own workflows, as the board lists them.
 */
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
const { listWorkflows } = await import('../src/workflows.ts');
const { HOME_REPO } = await import('../src/capabilities.ts');
const { readRun } = await import('agent-workflows');
const { isReadme, loadWorkflows } = await import('agent-workflows/workflow');
type WorkflowStepSpec = import('../src/workflows.ts').WorkflowStepSpec;

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

/** Yours, in the store: one step, and no README. */
const mine = path.join(root, 'workflows', 'mine');
write(path.join(mine, 'plan.md'), '---\nharness: codex\ncheck: test -f PLAN.md\nretries: 1\n---\nWrite PLAN.md.\n');

/** A spec with every key unset but `fields`. */
const spec = (fields: Partial<WorkflowStepSpec>): WorkflowStepSpec => ({
  harness: null, model: null, effort: null, after: [], resume: null, input: [], permissionMode: null, tools: null,
  deadlineSeconds: null, maxAttempts: null, check: null, retries: null, output: null, loop: null, rounds: null, ...fields,
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

test("GET /api/workflows lists each folder, the repository's then yours: its description, its steps' specs and its graph — and a folder the loader refuses, with the refusal and no steps", async () => {
  const res = await app.request('/api/workflows');
  assert.equal(res.status, 200);
  const refused = loaderRefusal(broken);
  assert.match(refused, /review: `afer` is not a key a step has/);

  assert.deepEqual(await res.json(), [
    { name: 'broken', from: 'repo', dir: broken, description: 'A reviewer with a misspelt key.', steps: [], graph: { roots: [], edges: [] }, error: refused },
    {
      name: 'good', from: 'repo', dir: good, description: 'Implement it, then review it, two rounds at most.',
      // The README is not among the steps.
      steps: [
        { name: 'implement', spec: spec({ harness: 'claude', model: 'opus', check: 'npm test' }) },
        { name: 'review', spec: spec({ harness: 'claude', after: ['implement'], tools: ['Read', 'Grep'], permissionMode: 'dontAsk', output: 'review.json', loop: 'implement', rounds: 2 }) },
      ],
      // `graphOf` the steps, as a run of it is drawn.
      graph: { roots: ['implement'], edges: [{ from: 'implement', to: 'review', kind: 'after' }, { from: 'review', to: 'implement', kind: 'loop', rounds: 2 }] },
      error: null,
    },
    {
      name: 'mine', from: 'yours', dir: mine, description: null,
      steps: [{ name: 'plan', spec: spec({ harness: 'codex', check: 'test -f PLAN.md', retries: 1 }) }],
      graph: { roots: ['plan'], edges: [] },
      error: null,
    },
  ]);
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
  // Found among the folders, never joined onto a path: `..` names none of them.
  for (const workflow of ['..', 'good/../mine', 'NOTES.txt']) assert.equal((await post({ workflow, brief: 'Do it.' })).status, 404, workflow);

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

test("this repository's workflows read as workflows: dev and dev-build are implement ⇄ review with the package's reviewer on Claude, and ui is the package's, copied", () => {
  const listed = listWorkflows(HOME_REPO, fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-no-yours-')));
  for (const name of ['dev', 'dev-build', 'ui']) assert.ok(listed.some((w) => w.name === name), `workflows/${name} is listed`);
  // Every workflow the repository carries reads, with a description: a folder `wf start` would refuse fails here.
  for (const w of listed) {
    assert.equal(w.error, null, `workflows/${w.name}`);
    assert.ok(w.description, `workflows/${w.name} has a README with a description`);
  }

  const shipped = path.join(HOME_REPO, 'packages', 'agent-workflows', 'workflows');
  const reviewer = loadWorkflows(shipped).find((s) => s.name === 'review')!;
  for (const [name, check] of [['dev', 'npm test && npm run typecheck'], ['dev-build', 'npm test && npm run typecheck && npm run build && npm run e2e']] as const) {
    const w = listed.find((x) => x.name === name)!;
    assert.deepEqual(w.steps, [
      { name: 'implement', spec: spec({ harness: 'claude', model: 'opus', check }) },
      {
        name: 'review',
        spec: spec({ harness: 'claude', model: 'opus', after: ['implement'], tools: ['Read', 'Grep', 'Glob', 'Bash'], permissionMode: 'dontAsk', output: 'review.schema.json', loop: 'implement', rounds: 3 }),
      },
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
