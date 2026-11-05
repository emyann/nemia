/**
 * The Workflows, Agents and Skills served as objects (definitions/): each list a `<Kind>List`, each name served once from the first origin
 * that holds it and every origin by `?origin=`, the factory's tree as `factory`; writes of yours taken in `default` alone, a factory's own
 * refused the factory's way and the files left as they were; a stale version a 409; the builder's save round-tripping its spec; each write
 * guarded before its body is read; and the routes these retire answering 404 — in a scratch store and a scratch repository.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, attachWorkflow, runStore } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';

const repo = scratch('nemia-api-definitions-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const STORE = path.join(root, 'workflows');
write(path.join(repo, 'workflows', 'make', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
write(path.join(repo, 'workflows', 'shared', 'go.md'), '---\nplace: git\n---\nThe repository says go.\n');
write(path.join(repo, 'workflows', 'agents', 'rex.md'), '---\nharness: claude\n---\nYou review.\n');
write(path.join(STORE, 'shared', 'go.md'), '---\nplace: git\n---\nYours says go.\n');
write(path.join(STORE, 'mine', 'plan.md'), '---\nplace: git\nharness: claude\n---\nWrite PLAN.md.\n');
write(path.join(STORE, 'mine', 'make.md'), '---\nafter: plan\nplace: git\nagent: implementer\n---\nBuild it.\n');
write(path.join(STORE, 'agents', 'implementer.md'), '---\nharness: claude\nmodel: opus\n---\nYou make what the plan says.\n');
addFactory({ name: 'works', repos: [repo] });
attachWorkflow({ factory: 'works', workflow: 'make' });
addFactory({ name: 'treed', repos: [repo], template: { source: '/t/team', version: '0.1.0', params: {} } });
const tree = path.join(root, 'factories', 'treed', 'tree');
write(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['make', 'shared'], hires: {} }));
write(path.join(tree, 'workflows', 'make', 'implement.md'), '---\nplace: git\n---\nImplement it, as the tree says.\n');
write(path.join(tree, 'workflows', 'agents', 'drafter.md'), '---\nharness: claude\n---\nYou draft, as the tree says.\n');

const json = { 'content-type': 'application/json' };
type Obj = {
  kind: string;
  metadata: { name: string; resourceVersion: string; continue?: string };
  spec: Record<string, unknown> & { steps?: Array<{ name: string; keys: Record<string, unknown>; body: string }> };
  status: Record<string, unknown> & { origin: string; shadowedBy?: string };
};
type List = { kind: string; metadata: { continue?: string; remainingItemCount?: number }; items: Obj[] };

const get = async <T>(url: string): Promise<{ status: number; body: T }> => {
  const res = await app.request(url);
  return { status: res.status, body: (await res.json()) as T };
};
const send = async (method: string, url: string, body?: unknown, headers: Record<string, string> = json) => {
  const res = await app.request(url, { method, headers, ...(body !== undefined && { body: JSON.stringify(body) }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & Obj };
};
const byName = (list: List) => Object.fromEntries(list.items.map((o) => [o.metadata.name, o]));
const W = '/api/namespaces/default/workflows';

test("default's WorkflowList: each name once, the repository's first, each with its typed graph and its revision", async () => {
  const { status, body } = await get<List>(W);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.kind, 'WorkflowList');
  const named = byName(body);
  assert.deepEqual(Object.keys(named).sort(), ['make', 'mine', 'shared']);
  assert.equal(named.shared?.status.origin, 'repo');
  for (const item of body.items) {
    const graph = item.status.graph as { nodes: unknown[] };
    assert.ok(Array.isArray(graph.nodes) && graph.nodes.length > 0, `${item.metadata.name} has its nodes`);
    assert.equal(typeof item.status.revision, 'number');
  }
});

test('?origin=yours serves yours, shadowed by the repository; a name none holds is a 404', async () => {
  const { body } = await get<List>(`${W}?origin=yours`);
  const shared = byName(body).shared;
  assert.deepEqual([shared?.status.origin, shared?.status.shadowedBy], ['yours', 'repo']);
  assert.equal((await get(`${W}/nothing`)).status, 404);
  assert.equal((await get(`${W}/make?origin=yours`)).status, 404);
  assert.equal((await get(`${W}?origin=tree`)).status, 422, 'an origin outside the four words');
});

test("in a factory, only its attached workflows; in one made from a template, its tree's are served as `factory`", async () => {
  const works = (await get<List>('/api/namespaces/works/workflows')).body;
  assert.deepEqual(
    works.items.map((o) => o.metadata.name),
    ['make'],
  );
  assert.ok('unfilled' in (works.items[0]?.status ?? {}));
  assert.ok(works.items[0]?.status.steps && 'hired' in (works.items[0].status.steps as object[])[0]);
  const treed = byName((await get<List>('/api/namespaces/treed/workflows')).body);
  assert.deepEqual([treed.make?.status.origin, treed.make?.status.dir], ['factory', path.join(tree, 'workflows', 'make')]);
  assert.equal(treed.shared?.status.origin, 'repo');
  const repos = (await get<Obj>('/api/namespaces/treed/workflows/make?origin=repo')).body;
  assert.deepEqual([repos.status.origin, repos.status.shadowedBy], ['repo', 'factory']);
});

test("a factory's own agent is served as `factory` in its factory, whether or not a step names it, and its write refused the factory's way", async () => {
  const listed = byName((await get<List>('/api/namespaces/treed/agents')).body);
  assert.equal(listed.drafter?.status.origin, 'factory', "the tree's agent no step names is listed in its factory");
  const one = await get<Obj>('/api/namespaces/treed/agents/drafter?origin=factory');
  assert.deepEqual([one.status, one.body.status.origin], [200, 'factory'], 'and read on its own, as its page reads it');
  const file = path.join(tree, 'workflows', 'agents', 'drafter.md');
  const before = fs.readFileSync(file, 'utf8');
  const put = await send('PUT', '/api/namespaces/treed/agents/drafter', {
    metadata: { resourceVersion: one.body.metadata.resourceVersion },
    spec: { instructions: 'Changed.' },
  });
  assert.deepEqual([put.status, put.body.way], [422, 'factory'], "a write of it is refused the factory's way");
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'and its file is left as it was');
  assert.equal(
    (await get<List>('/api/namespaces/default/agents')).body.items.some((o) => o.metadata.name === 'drafter'),
    false,
    'and default serves none',
  );
});

test("a factory's own workflow, a make in a factory and yours outside default are refused, each its way, nothing written", async () => {
  const file = path.join(tree, 'workflows', 'make', 'implement.md');
  const before = fs.readFileSync(file, 'utf8');
  const own = await send('PUT', '/api/namespaces/treed/workflows/make', { metadata: { resourceVersion: 'x' }, spec: { steps: [] } });
  assert.deepEqual([own.status, own.body.way], [422, 'factory']);
  assert.match(String(own.body.error), /nemia workflows write factory/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const made = await send('POST', '/api/namespaces/works/workflows', { metadata: { name: 'fresh' }, spec: { steps: [] } });
  assert.deepEqual([made.status, made.body.way], [422, 'factory']);
  assert.equal(fs.existsSync(path.join(STORE, 'fresh')), false);
  const away = await send('PUT', '/api/namespaces/works/workflows/mine', { metadata: { resourceVersion: 'x' }, spec: { steps: [] } });
  assert.deepEqual([away.status, away.body.way], [422, 'default']);
  const rex = await send('PUT', '/api/namespaces/default/agents/rex', { metadata: { resourceVersion: 'x' }, spec: {} });
  assert.equal(rex.status, 422, "the repository's agent is no write of the api's");
});

test("a builder's save round-trips its spec, the step files keep only their own keys, a stale version is a 409 and a cycle a 422 naming its steps", async () => {
  const read = (await get<Obj>(`${W}/mine?origin=yours`)).body;
  const steps = read.spec.steps ?? [];
  assert.deepEqual(
    steps.map((s) => [s.name, s.keys]),
    [
      ['plan', { place: 'git', harness: 'claude' }],
      ['make', { after: ['plan'], place: 'git', agent: 'implementer' }],
    ],
  );
  const saved = await send('PUT', `${W}/mine`, { metadata: { resourceVersion: read.metadata.resourceVersion }, spec: { steps } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.kind, 'Workflow');
  assert.deepEqual(saved.body.spec.steps, steps);
  assert.doesNotMatch(fs.readFileSync(path.join(STORE, 'mine', 'make.md'), 'utf8'), /model:/, "the agent's keys stay its own");
  const stale = await send('PUT', `${W}/mine`, { metadata: { resourceVersion: read.metadata.resourceVersion + 'x' }, spec: { steps } });
  assert.equal(stale.status, 409);
  const now = (await get<Obj>(`${W}/mine?origin=yours`)).body.metadata.resourceVersion;
  const cycle = steps.map((s) => (s.name === 'plan' ? { ...s, keys: { ...s.keys, after: ['make'] } } : s));
  const refused = await send('PUT', `${W}/mine`, { metadata: { resourceVersion: now }, spec: { steps: cycle } });
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.body.steps, ['make', 'plan']);
});

test('a workflow of yours made with its first step (201), then removed at the version read', async () => {
  const made = await send('POST', W, {
    metadata: { name: 'fresh' },
    spec: { steps: [{ name: 'only', keys: { place: 'git' }, body: 'Do it.' }] },
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.status.origin, 'yours');
  const missing = await send('DELETE', `${W}/fresh`);
  assert.equal(missing.status, 422, 'a removal says the version it read');
  const gone = await send('DELETE', `${W}/fresh?resourceVersion=${made.body.metadata.resourceVersion}`);
  assert.equal(gone.status, 200, JSON.stringify(gone.body));
  assert.equal(fs.existsSync(path.join(STORE, 'fresh')), false);
});

test('an agent of yours made (201), tried (201), and its removal refused while a step names it (409, with its users)', async () => {
  const made = await send('POST', '/api/namespaces/default/agents', {
    metadata: { name: 'tess' },
    spec: { keys: { harness: 'claude' }, instructions: 'You test.' },
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual([made.body.kind, made.body.status.origin], ['Agent', 'yours']);
  const tried = await send('POST', '/api/namespaces/default/agents/tess/try', { brief: 'Test the cache.' });
  assert.equal(tried.status, 201, JSON.stringify(tried.body));
  assert.equal(typeof tried.body.id, 'string');
  const implementer = (await get<Obj>('/api/namespaces/default/agents/implementer?origin=yours')).body;
  const kept = await send('DELETE', `/api/namespaces/default/agents/implementer?resourceVersion=${implementer.metadata.resourceVersion}`);
  assert.equal(kept.status, 409, JSON.stringify(kept.body));
  assert.ok(Array.isArray(kept.body.users));
  const repos = (await get<List>('/api/namespaces/default/agents?origin=repo')).body;
  assert.deepEqual(
    repos.items.map((o) => o.metadata.name),
    ['rex'],
  );
});

test('a builtin skill copied to yours (201), its files listed by path', async () => {
  const builtin = (await get<List>('/api/namespaces/default/skills?origin=builtin')).body;
  assert.equal(builtin.kind, 'SkillList');
  const name = builtin.items[0]?.metadata.name;
  assert.ok(name, 'Nemia builds in a skill');
  const copied = await send('POST', `/api/namespaces/default/skills/${name}/copy`);
  assert.equal(copied.status, 201, JSON.stringify(copied.body));
  assert.equal(copied.body.status.origin, 'yours');
  const shadowed = (await get<Obj>(`/api/namespaces/default/skills/${name}?origin=builtin`)).body;
  assert.equal(shadowed.status.shadowedBy, 'yours');
  const files = (await get<{ paths: string[] }>(`/api/namespaces/default/skills/${name}/files`)).body;
  assert.ok(files.paths.includes('SKILL.md'));
});

test('each write is refused 403 for another site and 415 for a body that is not JSON, before it is read', async () => {
  const writes: Array<[string, string]> = [
    ['POST', W],
    ['PUT', `${W}/mine`],
    ['DELETE', `${W}/mine`],
    ['POST', '/api/namespaces/default/agents'],
    ['PUT', '/api/namespaces/default/agents/implementer'],
    ['DELETE', '/api/namespaces/default/agents/implementer'],
    ['POST', '/api/namespaces/default/agents/implementer/try'],
    ['POST', '/api/namespaces/default/skills'],
    ['PUT', '/api/namespaces/default/skills/x'],
    ['POST', '/api/namespaces/default/skills/x/copy'],
  ];
  const before = fs.readdirSync(STORE).sort();
  for (const [method, url] of writes) {
    const away = await app.request(url, { method, headers: { ...json, host: 'evil.example' }, body: '{}' });
    assert.equal(away.status, 403, `${method} ${url}`);
    const text = await app.request(url, { method, headers: { 'content-type': 'text/plain' }, body: 'hi' });
    assert.equal(text.status, 415, `${method} ${url}`);
  }
  assert.deepEqual(fs.readdirSync(STORE).sort(), before);
});

test('a list is paged by limit and continue, and kept by labelSelector', async () => {
  const first = (await get<List>(`${W}?limit=1`)).body;
  assert.equal(first.items.length, 1);
  assert.ok(first.metadata.continue);
  const next = (await get<List>(`${W}?limit=1&continue=${first.metadata.continue}`)).body;
  assert.notEqual(next.items[0]?.metadata.name, first.items[0]?.metadata.name);
  assert.equal((await get<List>(`${W}?labelSelector=team%3Dnone`)).body.items.length, 0);
  assert.equal((await get(`${W}?labelSelector=%3D%3D`)).status, 422);
});

test("a workflow's revision is read and never written: the same on a second read, the ledger unchanged", async () => {
  const ledger = path.join(root, 'revisions');
  const was = fs.existsSync(ledger) ? fs.readdirSync(ledger, { recursive: true, encoding: 'utf8' }).sort((a, b) => a.localeCompare(b)) : [];
  const one = (await get<Obj>(`${W}/make`)).body.status.revision;
  const two = (await get<Obj>(`${W}/make`)).body.status.revision;
  assert.equal(one, two);
  assert.deepEqual(
    fs.existsSync(ledger) ? fs.readdirSync(ledger, { recursive: true, encoding: 'utf8' }).sort((a, b) => a.localeCompare(b)) : [],
    was,
  );
});

test('each retired path answers 404', async () => {
  const retired: Array<[string, string]> = [
    ['GET', '/api/workflows'],
    ['POST', '/api/workflows/yours'],
    ['PUT', '/api/workflows/yours/mine'],
    ['DELETE', '/api/workflows/yours/mine'],
    ['GET', '/api/agents'],
    ['GET', '/api/agents/yours/implementer'],
    ['PUT', '/api/agents/yours/implementer'],
    ['DELETE', '/api/agents/yours/implementer'],
    ['POST', '/api/agents/yours'],
    ['GET', '/api/agents/yours/implementer/card'],
    ['POST', '/api/agents/yours/implementer/try'],
    ['GET', '/api/skills'],
    ['GET', '/api/skills/yours/x'],
    ['PUT', '/api/skills/yours/x'],
    ['POST', '/api/skills/yours'],
  ];
  for (const [method, url] of retired) {
    const res = await app.request(url, { method, headers: json, ...(method !== 'GET' && { body: '{}' }) });
    assert.equal(res.status, 404, `${method} ${url}`);
  }
});

test("each status.revision is the number a run's start pins: 1 at the first start, then past 1 as the workflow, its agent and the agent's skill change and a start pins them again", async () => {
  write(path.join(STORE, 'skills', 'notes', 'SKILL.md'), '---\nname: notes\ndescription: Keeps notes.\n---\nKeep notes.\n');
  write(
    path.join(STORE, 'agents', 'implementer.md'),
    '---\nharness: claude\nmodel: opus\nskills: notes\n---\nYou make what the plan says.\n',
  );
  write(path.join(STORE, 'mine', 'plan.md'), '---\nplace: git\nagent: implementer\n---\nWrite PLAN.md.\n');
  attachWorkflow({ factory: 'works', workflow: 'mine' });
  execFileSync('git', ['-c', 'user.name=dev', '-c', 'user.email=dev@acme.test', 'commit', '-q', '--allow-empty', '-m', 'start'], {
    cwd: repo,
  });
  const pinnedAtStart = async (): Promise<Record<string, number>> => {
    const started = await send('POST', '/api/runs?factory=works', { workflow: 'mine', from: 'yours', brief: 'Make the plan.' });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    const pins = runStore.runs.read(String(started.body.id)).pinned ?? [];
    return Object.fromEntries(pins.map((p) => [`${p.kind}/${p.name}`, p.n]));
  };
  const served = async () => ({
    'workflow/mine': (await get<Obj>(`${W}/mine?origin=yours`)).body.status.revision,
    'agent/implementer': (await get<Obj>('/api/namespaces/default/agents/implementer?origin=yours')).body.status.revision,
    'skill/notes': (await get<Obj>('/api/namespaces/default/skills/notes?origin=yours')).body.status.revision,
  });
  const first = await pinnedAtStart();
  assert.deepEqual(
    [first['workflow/mine'], first['agent/implementer'], first['skill/notes']],
    [1, 1, 1],
    'the first start pins each kind at 1',
  );
  assert.deepEqual(await served(), { 'workflow/mine': 1, 'agent/implementer': 1, 'skill/notes': 1 }, 'each served revision is the pin');
  write(path.join(STORE, 'mine', 'plan.md'), '---\nplace: git\nagent: implementer\n---\nWrite PLAN.md, and say why.\n');
  write(
    path.join(STORE, 'agents', 'implementer.md'),
    '---\nharness: claude\nmodel: opus\nskills: notes\n---\nYou make what the plan says, tested.\n',
  );
  const second = await pinnedAtStart();
  assert.deepEqual(
    [second['workflow/mine'], second['agent/implementer'], second['skill/notes']],
    [2, 2, 1],
    'a start after the edit pins the workflow and the agent at 2, the skill unchanged',
  );
  assert.deepEqual(
    await served(),
    { 'workflow/mine': 2, 'agent/implementer': 2, 'skill/notes': 1 },
    'each served revision follows the pin past 1',
  );
  write(path.join(STORE, 'skills', 'notes', 'SKILL.md'), '---\nname: notes\ndescription: Keeps notes.\n---\nKeep notes, dated.\n');
  const third = await pinnedAtStart();
  assert.deepEqual(
    third,
    { 'workflow/mine': 3, 'agent/implementer': 3, 'skill/notes': 2 },
    "a skill's edit moves the agent's and the workflow's pins too, the skill found beside the workflow counted in each",
  );
  assert.deepEqual(await served(), third, 'each served revision counts the skill as the pin does');
});
