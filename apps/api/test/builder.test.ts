/**
 * The workflow builder's api (builder.ts): a folder of yours put back from its steps, made with a first step, given a schema, and the form a
 * step's keys are drawn in — in a scratch store and a scratch repository. Every write is read back from disk, and every refusal is made to
 * refuse, with the folder asserted as it was.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-builder-'));
process.env.WF_ROOT = root;
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-builder-repo-'));
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

const { app } = await import('../src/app.ts');
const { DEFAULT_HARNESS, stepsNamed } = await import('../src/builder.ts');
const { listWorkflows } = await import('../src/workflows.ts');
const { writeWorkflow } = await import('agent-workflows');
const { EFFORTS, HARNESSES, loadWorkflows, parseFolder, parseWorkflow, PERMISSION_MODES, renderStep, STEP_KEY_MEANINGS, STEP_KEYS } = await import('agent-workflows/workflow');
type KeyForm = import('../src/builder.ts').KeyForm;
type WorkflowSaved = import('../src/builder.ts').WorkflowSaved;
type ListedStep = import('../src/workflows.ts').ListedStep;
type WorkflowStepSpec = import('../src/workflows.ts').WorkflowStepSpec;

const STORE = path.join(root, 'workflows');
const SHIPPED = path.join(import.meta.dirname, '..', '..', '..', 'workflows', 'dev');

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const again = JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false });

/** Every file directly in `dir`, by name, with what it holds — a folder as one — : what a refused write must leave as it was. */
const snapshot = (dir: string): Record<string, string> =>
  (fs.existsSync(dir)
    ? Object.fromEntries(fs.readdirSync(dir).sort().map((f) => [f, fs.statSync(path.join(dir, f)).isDirectory() ? '(a folder)' : fs.readFileSync(path.join(dir, f), 'utf8')]))
    : {});

/** A copy of the repository's `dev` — README, schema, comments and `budget: 20` — as a workflow of yours named `name`. */
function devIn(name: string): string {
  const dir = path.join(STORE, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(SHIPPED)) fs.copyFileSync(path.join(SHIPPED, file), path.join(dir, file));
  return dir;
}

/** A workflow of yours, `plan` then `build`, with a schema `build` does not name yet. */
function planned(name: string): string {
  const dir = path.join(STORE, name);
  write(path.join(dir, 'plan.md'), '---\n# Plans first.\nharness: claude\n---\nWrite PLAN.md.\n');
  write(path.join(dir, 'build.md'), '---\nafter: plan\ncheck: npm test\n---\nBuild what PLAN.md says.\n');
  write(path.join(dir, 'build.schema.json'), again);
  return dir;
}

/** The repository's own, which the builder never writes. */
const theirs = path.join(repo, 'workflows', 'good');
write(path.join(theirs, 'implement.md'), '---\nmodel: opus\n---\nImplement it.\n');

/** A workflow's steps as GET /api/workflows lists them. */
async function listedSteps(name: string, from = 'yours'): Promise<ListedStep[]> {
  const all = (await (await app.request('/api/workflows')).json()) as Array<{ name: string; from: string; steps: ListedStep[] }>;
  const found = all.find((w) => w.name === name && w.from === from);
  assert.ok(found, `${from} lists ${name}`);
  return found.steps;
}

const json = { 'content-type': 'application/json' };
const put = (name: string, body: unknown, from = 'yours', headers: Record<string, string> = json) =>
  app.request(`/api/workflows/${from}/${name}`, { method: 'PUT', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const post = (body: unknown, from = 'yours', headers: Record<string, string> = json) =>
  app.request(`/api/workflows/${from}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const putSchema = (name: string, file: string, body: unknown, from = 'yours', headers: Record<string, string> = json) =>
  app.request(`/api/workflows/${from}/${name}/schemas/${file}`, { method: 'PUT', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** A spec with every key unset but `fields`, as the listing has one. */
const spec = (fields: Partial<WorkflowStepSpec> = {}): WorkflowStepSpec => ({
  harness: null, model: null, effort: null, after: [], resume: null, input: [], permissionMode: null, tools: null, disallow: [], remote: null,
  deadlineSeconds: null, maxAttempts: null, budget: null, check: null, retries: null, gate: null, output: null, loop: null, rounds: null, ...fields,
});

test('GET /api/workflows/keys is the form a step is drawn in: every key in the package\'s order with its line of meaning, how it is set, and the words it may take', async () => {
  const res = await app.request('/api/workflows/keys');
  assert.equal(res.status, 200);
  const form: KeyForm = await res.json();
  assert.deepEqual(form.keys.map((k) => k.key), [...STEP_KEYS]);
  for (const k of form.keys) assert.equal(k.meaning, STEP_KEY_MEANINGS[k.key], k.key);
  const kindOf = Object.fromEntries(form.keys.map((k) => [k.key, k.kind]));
  assert.deepEqual(form.keys.find((k) => k.key === 'harness')?.choices, HARNESSES);
  assert.deepEqual(form.keys.find((k) => k.key === 'effort')?.byHarness, EFFORTS);
  assert.deepEqual(form.keys.find((k) => k.key === 'permissionMode')?.byHarness, PERMISSION_MODES);

  // The kinds held to the parser. A count is what the parser refuses as "not a count", and nothing else is: in a folder where every key can be
  // read — `b` waits on `a`, loops to it, and declares `again` — each key set to a word that is not a number.
  const refusedAs = (key: string, value: string): string | null => {
    const lines = { after: 'a', output: 'b.schema.json', loop: 'a' } as Record<string, string>;
    lines[key] = value;
    const b = `---\n${Object.entries(lines).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\nDo b.\n`;
    try {
      parseFolder([['a', 'Do a.\n'], ['b', b]], (f) => (f === 'b.schema.json' ? again : undefined));
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  };
  for (const key of STEP_KEYS) {
    const said = refusedAs(key, 'several') ?? '';
    assert.equal(kindOf[key] === 'count', said.includes(`\`${key}: several\` is not a count`), `${key} (${kindOf[key]}): ${said}`);
  }
  // A flag's words are the ones the parser takes, and gate's `false` is refused.
  const flags = Object.fromEntries(form.keys.filter((k) => k.kind === 'flag').map((k) => [k.key, k.choices]));
  assert.deepEqual(flags, { remote: ['true', 'false'], gate: ['true'] });
  for (const [key, words] of Object.entries(flags)) for (const word of words!) assert.equal(refusedAs(key, word), null, `${key}: ${word}`);
  assert.match(refusedAs('gate', 'false') ?? '', /`gate: false` is what a step without the line already is/);
  // The default harness is the parser's: a step that names none takes each of its modes, and not a mode only codex takes.
  assert.equal(form.defaultHarness, DEFAULT_HARNESS);
  for (const mode of PERMISSION_MODES[DEFAULT_HARNESS]!) parseWorkflow('a', `---\npermissionMode: ${mode}\n---\nDo a.\n`);
  const codexOnly = PERMISSION_MODES.codex!.find((m) => !PERMISSION_MODES[DEFAULT_HARNESS]!.includes(m))!;
  assert.throws(() => parseWorkflow('a', `---\npermissionMode: ${codexOnly}\n---\nDo a.\n`), (e: Error) => e.message.startsWith('a: '));
});

test("PUT /api/workflows/yours/:name with a folder's steps as the listing has them writes nothing: every file is kept, comments, budget and all", async () => {
  const dir = devIn('as-listed');
  const before = snapshot(dir);
  const steps = await listedSteps('as-listed');
  assert.equal(steps.find((s) => s.name === 'review')?.spec.budget, 20, "the listing carries review's budget, so a put does not drop it");
  const res = await put('as-listed', { steps });
  assert.equal(res.status, 200, await res.clone().text());
  const saved: WorkflowSaved = await res.json();
  assert.deepEqual([saved.written, saved.kept, saved.removed], [[], ['implement.md', 'review.md'], []]);
  assert.deepEqual(snapshot(dir), before, 'byte for byte');
  assert.deepEqual(saved.workflow, listWorkflows(repo, root).find((w) => w.name === 'as-listed' && w.from === 'yours'), 'answered as the listing reads it');
});

test('PUT /api/workflows/yours/:name writes the folder the steps make — a step added, an edge drawn, a key set, a step gone, the README — and answers it read back from disk', async () => {
  const dir = planned('drawn');
  const [plan, build] = await listedSteps('drawn') as [ListedStep, ListedStep];
  const review: ListedStep = { name: 'review', spec: spec({ after: ['build'], model: 'opus', output: 'build.schema.json', loop: 'build', rounds: 2 }), body: 'Review the build.' };
  const res = await put('drawn', { steps: [plan, { ...build, spec: { ...build.spec, retries: 1 } }, review], readme: '# drawn\n\nPlan, build, review.\n' });
  assert.equal(res.status, 200, await res.clone().text());
  const saved: WorkflowSaved = await res.json();
  assert.deepEqual([saved.written, saved.kept, saved.removed], [['README.md', 'build.md', 'review.md'], ['plan.md'], []]);
  assert.equal(fs.readFileSync(path.join(dir, 'plan.md'), 'utf8'), '---\n# Plans first.\nharness: claude\n---\nWrite PLAN.md.\n', 'a step unchanged keeps its file, comment and all');
  assert.equal(fs.readFileSync(path.join(dir, 'build.md'), 'utf8'), '---\nafter: plan\ncheck: npm test\nretries: 1\n---\nBuild what PLAN.md says.\n');
  assert.equal(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), '---\nafter: build\nmodel: opus\noutput: build.schema.json\nloop: build\nrounds: 2\n---\nReview the build.\n');
  assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), '# drawn\n\nPlan, build, review.\n');
  assert.deepEqual(saved.workflow.steps.map((s) => s.name), ['plan', 'build', 'review']);
  assert.deepEqual(saved.workflow.graph.edges, [{ from: 'plan', to: 'build', kind: 'after' }, { from: 'build', to: 'review', kind: 'after' }, { from: 'review', to: 'build', kind: 'loop', rounds: 2 }]);
  assert.equal(saved.workflow.description, 'Plan, build, review.');
  assert.deepEqual(saved.workflow, listWorkflows(repo, root).find((w) => w.name === 'drawn'), 'answered as the listing reads it');

  // An edge deleted takes its key; a step gone takes its file. A key the listing leaves out is unset.
  const gone = await put('drawn', { steps: [plan, { name: 'build', spec: { check: 'npm test' }, body: 'Build it.' }] });
  assert.equal(gone.status, 200, await gone.clone().text());
  const after: WorkflowSaved = await gone.json();
  assert.deepEqual([after.written, after.removed], [['build.md'], ['review.md']]);
  assert.equal(fs.readFileSync(path.join(dir, 'build.md'), 'utf8'), '---\ncheck: npm test\n---\nBuild it.\n');
  assert.deepEqual(after.workflow.graph, { roots: ['build', 'plan'], edges: [] });
  assert.deepEqual(after.workflow.schemas, ['build.schema.json'], 'the schema is left as it is');
});

test("REFUSED at shipped defaults: what the package refuses is a 422 in its words, naming the steps it names — a cycle, an after naming no step, a key no step has, a loop with no output, a schema not there, a name that is not a file's, a name twice, a list of no tools, a line break, no steps — and the folder is as it was", async () => {
  const dir = planned('refused');
  const before = snapshot(dir);
  const [plan, build] = await listedSteps('refused') as [ListedStep, ListedStep];
  const cases: Array<[string, unknown[], string[]]> = [
    ['a cycle', [{ ...plan, spec: { ...plan.spec, after: ['build'] } }, build], ['build', 'plan']],
    ['an after naming no step', [plan, { ...build, spec: { ...build.spec, after: ['plan', 'nope'] } }], ['build']],
    ['a key no step has', [plan, { ...build, spec: { ...build.spec, afer: ['plan'] } }], ['build']],
    ['a loop with no output', [plan, { ...build, spec: { ...build.spec, loop: 'plan' } }], ['build']],
    ['a schema not there', [plan, { ...build, spec: { ...build.spec, output: 'nope.schema.json' } }], ['build']],
    ['a schema outside the folder', [plan, { ...build, spec: { ...build.spec, output: '../drawn/build.schema.json' } }], ['build']],
    ["a name that is not a file's", [plan, { ...build, name: 'build/it' }], ['build/it']],
    ['a name twice', [plan, build, { ...build }], ['build']],
    ['no tools', [plan, { ...build, spec: { ...build.spec, tools: [] } }], ['build']],
    ['a line break in a check', [plan, { ...build, spec: { ...build.spec, check: 'npm test\nharness: codex' } }], ['build']],
    ['an empty body', [plan, { ...build, body: '  ' }], ['build']],
    ['no steps', [], []],
  ];
  for (const [what, steps, named] of cases) {
    const res = await put('refused', { steps });
    assert.equal(res.status, 422, `${what}: ${await res.clone().text()}`);
    const { error, steps: said } = await res.json();
    // The package's sentence, word for word: what `writeWorkflow` throws for the same steps.
    const drafts = (steps as ListedStep[]).map((s) => ({ ...Object.fromEntries(Object.entries(s.spec).filter(([, v]) => v !== null)), name: s.name, body: s.body, ...(s.spec.output ? { output: { file: s.spec.output } } : {}), after: s.spec.after ?? [] }));
    assert.throws(() => writeWorkflow(dir, drafts as never), (e: Error) => e.message === error, `${what}: ${error}`);
    assert.deepEqual(said, named, `${what}: ${error}`);
    assert.deepEqual(snapshot(dir), before, `${what}: nothing written`);
  }
});

test("REFUSED at shipped defaults: a write to the repository's workflows is a 403 that says to copy the folder into the repository by hand — by the path and by the body's `from` — and nothing is written there or in yours", async () => {
  planned('mine');
  const before = [snapshot(theirs), snapshot(path.join(STORE, 'mine'))];
  const step = { name: 'implement', spec: spec({ model: 'sonnet' }), body: 'Implement it my way.' };
  const sentence = (route: string, name: string | null) =>
    `${route} refuses to write the repository's workflows (${path.join(repo, 'workflows')}): the builder writes only yours, in ${STORE}, and the api writes nothing into a checkout. Build the workflow in yours${name ? ` — \`cp -r ${path.join(repo, 'workflows', name)} ${STORE}/\` starts from this one —` : ''} then copy the folder into ${path.join(repo, 'workflows')} by hand, where git shows it as a change to commit.`;
  for (const [res, route, name] of [
    [await put('good', { steps: [step] }, 'repo'), 'PUT /api/workflows/repo/good', 'good'],
    [await put('mine', { steps: [step], from: 'repo' }), 'PUT /api/workflows/yours/mine', 'mine'],
    [await post({ name: 'good', step }, 'repo'), 'POST /api/workflows/repo', null],
    [await post({ name: 'new', step, from: 'repo' }), 'POST /api/workflows/yours', 'new'],
    [await putSchema('good', 'x.schema.json', { text: again }, 'repo'), 'PUT /api/workflows/repo/good/schemas/x.schema.json', 'good'],
  ] as const) {
    assert.equal(res.status, 403, route);
    assert.equal((await res.json()).error, sentence(route, name), route);
  }
  // Anywhere else is not a source at all.
  for (const res of [await put('mine', { steps: [step] }, 'elsewhere'), await post({ name: 'x', step }, 'elsewhere'), await put('mine', { steps: [step], from: 'elsewhere' })]) {
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /the builder writes yours, at \/api\/workflows\/yours\/…, and this request named "elsewhere"\.$/);
  }
  assert.deepEqual([snapshot(theirs), snapshot(path.join(STORE, 'mine'))], before);
  assert.equal(fs.existsSync(path.join(STORE, 'new')), false);
  assert.equal(fs.existsSync(path.join(STORE, 'x')), false);
});

test('REFUSED at shipped defaults: a write another site could make — a body not sent as application/json (415), a page on another site (403), a name that is not this machine (403) — for each of the three writes, and nothing is written', async () => {
  const dir = planned('guarded');
  const before = snapshot(dir);
  const steps = await listedSteps('guarded');
  const writes = [
    ['PUT /api/workflows/yours/guarded', (h: Record<string, string>) => put('guarded', { steps: [steps[0]] }, 'yours', h)],
    ['POST /api/workflows/yours', (h: Record<string, string>) => post({ name: 'guarded-2', step: steps[0] }, 'yours', h)],
    ['PUT /api/workflows/yours/guarded/schemas/x.schema.json', (h: Record<string, string>) => putSchema('guarded', 'x.schema.json', { text: again }, 'yours', h)],
  ] as const;
  for (const [route, send] of writes) {
    const type = await send({ 'content-type': 'text/plain;charset=UTF-8' });
    assert.equal(type.status, 415, route);
    assert.ok((await type.json()).error.startsWith(`${route} takes its body as \`content-type: application/json\``), route);
    const site = await send({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
    assert.equal(site.status, 403, route);
    assert.ok((await site.json()).error.startsWith(`${route} refuses a request made by a page on another site (Sec-Fetch-Site: cross-site)`), route);
    const host = await send({ 'content-type': 'application/json', host: 'evil.example:8787' });
    assert.equal(host.status, 403, route);
    assert.ok((await host.json()).error.startsWith(`${route} refuses a request addressed to evil.example:8787`), route);
  }
  assert.deepEqual(snapshot(dir), before);
  assert.equal(fs.existsSync(path.join(STORE, 'guarded-2')), false);
});

test("REFUSED at shipped defaults: a body not in the listing's shape is a 400 naming the step and the key — and nothing is written", async () => {
  const dir = planned('shaped');
  const before = snapshot(dir);
  const [plan] = await listedSteps('shaped') as [ListedStep];
  const cases: Array<[unknown, RegExp]> = [
    ['not json', /takes a JSON body/],
    [[], /takes a JSON object/],
    [{}, /takes the workflow's steps in `steps`, a list/],
    [{ steps: 'plan' }, /`steps`, a list/],
    [{ steps: ['plan'] }, /step 1 is "plan", and a step is an object\./],
    [{ steps: [{ spec: plan.spec, body: plan.body }] }, /step 1 has no `name`/],
    [{ steps: [{ name: 'plan', spec: plan.spec }] }, /step 1 \(plan\) has no `body`/],
    [{ steps: [{ name: 'plan', spec: ['harness'], body: 'x' }] }, /step 1 \(plan\)'s `spec` is \["harness"\], and it is an object/],
    [{ steps: [{ ...plan, spec: { after: 'build' } }] }, /step 1 \(plan\)'s `after` is a list of strings, such as \["implement"\], or null for unset, and this request's was "build"\./],
    [{ steps: [{ ...plan, spec: { deadlineSeconds: '5m' } }] }, /`deadlineSeconds` is a number, or null for unset, and this request's was "5m"/],
    [{ steps: [{ ...plan, spec: { budget: '$5' } }] }, /`budget` is a number/],
    [{ steps: [{ ...plan, spec: { remote: 'yes' } }] }, /`remote` is true or false/],
    [{ steps: [{ ...plan, spec: { gate: 'true' } }] }, /`gate` is true or false/],
    [{ steps: [{ ...plan, spec: { output: { file: 'x.json' } } }] }, /`output` is a string, the schema file's name/],
    [{ steps: [{ ...plan, spec: { tools: ['Read', 3] } }] }, /`tools` is a list of strings/],
    [{ steps: [plan], readme: 42 }, /`readme` is the README's text, a string, or left out/],
  ];
  for (const [body, said] of cases) {
    const res = await put('shaped', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const { error } = await res.json();
    assert.match(error, said, error);
    assert.ok(error.startsWith('PUT /api/workflows/yours/shaped'), error);
  }
  assert.deepEqual(snapshot(dir), before);
});

test("REFUSED at shipped defaults: a put to a folder yours does not have is a 404 that says how to make one — a name only the repository has, a hidden folder, a name that climbs — and nothing is made", async () => {
  write(path.join(STORE, '.hidden', 'plan.md'), 'Plan it.\n');
  const step = { name: 'plan', spec: spec(), body: 'Plan it.' };
  // `..` itself never reaches the route: a URL resolves it first. An encoded slash does.
  for (const name of ['nope', 'good', '.hidden', '..%2Fworkflows%2Fmine', '..%2F..%2Fworkflows']) {
    const res = await put(name, { steps: [step] });
    assert.equal(res.status, 404, name);
    const { error } = await res.json();
    assert.ok(error.startsWith(`No workflow '${decodeURIComponent(name)}' in ${STORE}.`) && error.endsWith('To make a new one, POST /api/workflows/yours with its name and a first step.'), error);
  }
  assert.equal(fs.existsSync(path.join(STORE, 'nope')), false);
  assert.equal(fs.existsSync(path.join(STORE, 'good')), false);
  assert.deepEqual(snapshot(path.join(STORE, '.hidden')), { 'plan.md': 'Plan it.\n' });
});

test('POST /api/workflows/yours makes a folder with its first step, and a README when given one, answered read back from disk', async () => {
  const res = await post({ name: 'fresh', step: { name: 'plan', spec: spec({ harness: 'codex', check: 'test -f PLAN.md' }), body: 'Write PLAN.md.' }, readme: '# fresh\n\nA plan.\n' });
  assert.equal(res.status, 201, await res.clone().text());
  const saved: WorkflowSaved = await res.json();
  const dir = path.join(STORE, 'fresh');
  assert.deepEqual(snapshot(dir), { 'README.md': '# fresh\n\nA plan.\n', 'plan.md': '---\nharness: codex\ncheck: test -f PLAN.md\n---\nWrite PLAN.md.\n' });
  assert.deepEqual(saved.written, ['README.md', 'plan.md']);
  assert.deepEqual(saved.workflow, listWorkflows(repo, root).find((w) => w.name === 'fresh'));
  assert.equal(saved.workflow.from, 'yours');
  // The step as a start would read it.
  assert.deepEqual(loadWorkflows(dir).map((s) => renderStep(s)), ['---\nharness: codex\ncheck: test -f PLAN.md\n---\nWrite PLAN.md.\n']);

  // A name the repository has too is yours to make: the board starts it with `from`.
  const same = await post({ name: 'good', step: { name: 'implement', spec: spec(), body: 'Implement it.' } });
  assert.equal(same.status, 201, await same.clone().text());
  assert.deepEqual(snapshot(path.join(STORE, 'good')), { 'implement.md': 'Implement it.\n' });
  fs.rmSync(path.join(STORE, 'good'), { recursive: true });
});

test("REFUSED at shipped defaults: a new folder whose name is not a folder's (400), one yours already has or a file has (409), and a first step the package refuses (422, naming it) — and nothing is made", async () => {
  planned('taken');
  write(path.join(STORE, 'NOTES.txt'), 'Ideas.\n');
  const listing = snapshot(STORE);
  const step = { name: 'plan', spec: spec(), body: 'Plan it.' };
  for (const [name, said] of [
    [undefined, /^A workflow has no name/], ['', /^A workflow has no name/], [42, /^A workflow has no name/], ['a/b', /a slash names a folder inside another/],
    ['..', /a folder whose name starts with a dot is hidden/], ['.hidden', /is hidden/], [' spaced ', /spaces around it/], ['tab\tbed', /control character/],
    ['x'.repeat(256), /255 bytes/],
  ] as const) {
    const res = await post({ name, step });
    assert.equal(res.status, 400, String(name));
    assert.match((await res.json()).error, said, String(name));
  }
  const taken = await post({ name: 'taken', step });
  assert.equal(taken.status, 409);
  assert.equal((await taken.json()).error, `Yours already has a workflow named 'taken' (${path.join(STORE, 'taken')}). PUT /api/workflows/yours/taken changes it, or name the new one otherwise.`);
  const file = await post({ name: 'NOTES.txt', step });
  assert.equal(file.status, 409);
  assert.match((await file.json()).error, /^Yours has a file named 'NOTES\.txt'/);

  for (const [first, named] of [
    [{ name: 'plan', spec: spec(), body: '' }, ['plan']],
    [{ name: 'plan', spec: spec({ after: ['nope'] }), body: 'Plan it.' }, ['plan']],
    [{ name: 'plan', spec: spec({ gate: false as never }), body: 'Plan it.' }, ['plan']],
    [{ name: 'README', spec: spec(), body: 'Plan it.' }, ['README']],
  ] as const) {
    const res = await post({ name: 'unmade', step: first });
    assert.equal(res.status, 422, JSON.stringify(first));
    const { error, steps } = await res.json();
    assert.deepEqual(steps, named, error);
  }
  assert.equal((await post({ name: 'unmade', step: 'plan' })).status, 400);
  assert.equal((await post({ name: 'unmade', step, readme: ['#'] })).status, 400);
  assert.equal(fs.existsSync(path.join(STORE, 'unmade')), false, 'nothing made');
  assert.deepEqual(snapshot(STORE), listing);
});

test('PUT /api/workflows/yours/:name/schemas/:file writes a schema beside the steps, which the listing then offers and a step may name', async () => {
  const dir = planned('schemed');
  const text = JSON.stringify({ type: 'object', properties: { risks: { type: 'array', items: { type: 'string' } } }, required: ['risks'], additionalProperties: false }, null, 2);
  const res = await putSchema('schemed', 'plan.schema.json', { text });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await res.json(), { file: 'plan.schema.json', dir, schemas: ['build.schema.json', 'plan.schema.json'] });
  assert.equal(fs.readFileSync(path.join(dir, 'plan.schema.json'), 'utf8'), `${text}\n`);

  const [plan, build] = await listedSteps('schemed') as [ListedStep, ListedStep];
  const named = await put('schemed', { steps: [{ ...plan, spec: { ...plan.spec, output: 'plan.schema.json' } }, { ...build, spec: { ...build.spec, input: ['plan'] } }] });
  assert.equal(named.status, 200, await named.clone().text());
  const saved: WorkflowSaved = await named.json();
  assert.deepEqual(saved.workflow.steps.map((s) => [s.name, s.spec.output, s.spec.input]), [['plan', 'plan.schema.json', []], ['build', null, ['plan']]]);

  // Written again, it is replaced.
  const replaced = await putSchema('schemed', 'plan.schema.json', { text: text.replace('risks', 'risks') });
  assert.equal(replaced.status, 200);
});

test("REFUSED at shipped defaults: a schema whose file is not a schema's (400), whose text is not JSON or not an object (422), that a step names and would no longer read with (422, naming it), or in a folder yours does not have (404) — and nothing is written", async () => {
  const loops = path.join(STORE, 'loops');
  write(path.join(loops, 'implement.md'), 'Implement it.\n');
  write(path.join(loops, 'review.md'), '---\nafter: implement\noutput: review.schema.json\nloop: implement\n---\nReview it.\n');
  write(path.join(loops, 'review.schema.json'), again);
  assert.deepEqual(loadWorkflows(loops).map((s) => s.name), ['implement', 'review']);
  const before = snapshot(loops);

  for (const [file, said] of [['review.txt', /ends in \.json/], ['.hidden.json', /is hidden/], ['..%2Fx.json', /a slash names a file in another/], ['.json', /is hidden/]] as const) {
    const res = await putSchema('loops', file, { text: again });
    assert.equal(res.status, 400, file);
    assert.match((await res.json()).error, said, file);
  }
  for (const body of ['not json', {}, { text: 42 }]) assert.equal((await putSchema('loops', 'x.schema.json', body)).status, 400, JSON.stringify(body));
  const notJson = await putSchema('loops', 'x.schema.json', { text: '{ "type": ' });
  assert.equal(notJson.status, 422);
  assert.match((await notJson.json()).error, /^x\.schema\.json is not JSON \(.+\)\. A schema is a JSON object/);
  const notObject = await putSchema('loops', 'x.schema.json', { text: '["again"]' });
  assert.equal(notObject.status, 422);
  assert.match((await notObject.json()).error, /^x\.schema\.json is \["again"\], and a schema is a JSON object/);

  // review loops, so its schema declares `again`: one without it would leave the folder unreadable, in the parser's words.
  const without = JSON.stringify({ type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false });
  const breaks = await putSchema('loops', 'review.schema.json', { text: without });
  assert.equal(breaks.status, 422);
  const { error, steps } = await breaks.json();
  assert.equal(error, 'review: `loop: implement` runs implement again when this step\'s closeout says `again: true`, and `output: review.schema.json` does not declare `again`. Declare it — `"again": { "type": "boolean" }`, listed in `required` — so the run reads a yes or a no, never prose.');
  assert.deepEqual(steps, ['review']);

  const nowhere = await putSchema('nope', 'x.schema.json', { text: again });
  assert.equal(nowhere.status, 404);
  assert.deepEqual(snapshot(loops), before, 'nothing written');
  assert.equal(fs.existsSync(path.join(STORE, 'nope')), false);
});

test("stepsNamed: the steps a refusal names — a cycle's several, a name refused or given twice, and the step a refusal opens on, the longest name first", () => {
  const names = ['review', 'review-2', 'plan', 'a/b'];
  assert.deepEqual(stepsNamed('these steps wait on each other: plan, review', names), ['plan', 'review']);
  assert.deepEqual(stepsNamed('review-2: waits on "x", which is not a step here', names), ['review-2']);
  assert.deepEqual(stepsNamed('review: waits on "x", which is not a step here', names), ['review']);
  assert.deepEqual(stepsNamed('review is in two loops: a\'s and b\'s.', names), ['review']);
  assert.deepEqual(stepsNamed("`a/b` is not a step's name: a step is a file in its workflow's folder, and a slash names a file in another. Name it as its file is named, without .md — implement, say.", names), ['a/b']);
  assert.deepEqual(stepsNamed('two steps are named plan, and a step is its file, plan.md. Rename one of them.', names), ['plan']);
  assert.deepEqual(stepsNamed('no steps to write to /x, and a workflow has at least one.', names), []);
  assert.deepEqual(stepsNamed('planning: something', names), []);
});
