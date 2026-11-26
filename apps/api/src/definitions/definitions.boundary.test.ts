/**
 * The Workflows, Agents and Skills served as objects (definitions/): each list a `<Kind>List`, each name served once from the first origin
 * that holds it and every origin by `?origin=`, the factory's tree as `factory`; writes of yours taken in `default` alone, a factory's own
 * refused the factory's way and the files left as they were; a stale version a 409; the builder's save round-tripping its spec; and the
 * routes these retire answering 404 — in a scratch store and a scratch repository.
 */
import { root } from '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { addFactory, attachWorkflow, runsNow } from 'agent-orchestrator/testing';
import { scratch } from 'test-kit/scratch';
import { app } from '../app.ts';

/**
 * The scratch repository, which the factory `works` works on: read in `default` by its `?repo=` (`onRepoUrl`), which that factory lets
 * the api read.
 */
const repo = scratch('nemia-api-definitions-');
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

/** `url` with the scratch repository's `?repo=`, where it asks the default factory and names no repository. */
const onRepoUrl = (url: string) =>
  !/^\/api\/namespaces\/default(?:[/?]|$)/.test(url) || /[?&]repo=/.test(url)
    ? url
    : `${url}${url.includes('?') ? '&' : '?'}repo=${encodeURIComponent(repo)}`;

const write = (file: string, text: string) => {
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
addFactory({ name: 'works', volumes: [repo].map((r) => `${r}:rw`) });
attachWorkflow({ factory: 'works', workflow: 'make' });
addFactory({ name: 'treed', volumes: [repo].map((r) => `${r}:rw`), template: { source: '/t/team', version: '0.1.0', params: {} } });
const tree = path.join(root, 'factories', 'treed', 'tree');
write(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['make', 'shared'], hires: {} }));
write(path.join(tree, 'workflows', 'make', 'implement.md'), '---\nplace: git\n---\nImplement it, as the tree says.\n');
write(path.join(tree, 'workflows', 'agents', 'drafter.md'), '---\nharness: claude\nskills: [outline]\n---\nYou draft, as the tree says.\n');
write(
  path.join(tree, 'workflows', 'skills', 'outline', 'SKILL.md'),
  "---\nname: outline\ndescription: The tree's own outline.\n---\n# Outline\n",
);

const json = { 'content-type': 'application/json' };
type Obj = {
  kind: string;
  metadata: { name: string; resourceVersion: string; continue?: string };
  spec: Record<string, unknown> & { steps?: Array<{ name: string; keys: Record<string, unknown>; body: string }> };
  status: Record<string, unknown> & { origin: string; shadowedBy?: string };
};
type List = { kind: string; metadata: { continue?: string; remainingItemCount?: number }; items: Obj[] };

const get = async <T>(url: string) => {
  const res = await app.request(onRepoUrl(url));
  return { status: res.status, body: (await res.json()) as T };
};
const send = async (method: string, url: string, body?: unknown, headers: Record<string, string> = json) => {
  const res = await app.request(onRepoUrl(url), { method, headers, ...(body !== undefined && { body: JSON.stringify(body) }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & Obj };
};
const byName = (list: List) => Object.fromEntries(list.items.map((o) => [o.metadata.name, o]));
const W = '/api/namespaces/default/workflows';
/** The library's workflows, where a write of the user library is sent. */
const L = '/api/workflows';

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
    assert.match(item.metadata.resourceVersion, /^\d+$/, `${item.metadata.name} is served at a revision`);
  }
});

test('?origin=user serves yours, shadowed by the repository; a name none holds is a 404', async () => {
  const { body } = await get<List>(`${W}?origin=user`);
  const shared = byName(body).shared;
  assert.deepEqual([shared?.status.origin, shared?.status.shadowedBy], ['user', 'repo']);
  assert.equal((await get(`${W}/nothing`)).status, 404);
  assert.equal((await get(`${W}/make?origin=user`)).status, 404);
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

test("a factory's own agent finds its tree's skill as a start there finds it, and the tree's skill names the tree's agent that gives it", async () => {
  const drafter = (await get<Obj>('/api/namespaces/treed/agents/drafter?origin=factory')).body;
  const given = drafter.status.given as Array<{ name: string; from: string | null; entry: unknown }>;
  assert.deepEqual(
    given.map((g) => [g.name, g.from, g.entry !== null]),
    [['outline', 'factory', true]],
    "drafter's outline is the tree's, found, with its card entry",
  );
  const outline = (await get<Obj>('/api/namespaces/treed/skills/outline?origin=factory')).body;
  assert.deepEqual(outline.status.usedBy, [{ from: 'factory', name: 'drafter' }], "the tree's outline is given by the tree's drafter");
});

test("a factory's own workflow, a make in a factory and yours outside default are refused, each its way, nothing written", async () => {
  const file = path.join(tree, 'workflows', 'make', 'implement.md');
  const before = fs.readFileSync(file, 'utf8');
  const own = await send('PUT', '/api/namespaces/treed/workflows/make', { metadata: { resourceVersion: 'x' }, spec: { steps: [] } });
  assert.deepEqual([own.status, own.body.way], [422, 'factory']);
  assert.match(String(own.body.error), /nemia propose/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const made = await send('POST', '/api/namespaces/works/workflows', { metadata: { name: 'fresh' }, spec: { steps: [] } });
  assert.deepEqual([made.status, made.body.way], [422, 'factory']);
  assert.equal(fs.existsSync(path.join(STORE, 'fresh')), false);
  const away = await send('PUT', '/api/namespaces/works/workflows/mine', { metadata: { resourceVersion: 'x' }, spec: { steps: [] } });
  assert.deepEqual([away.status, away.body.way], [422, 'library']);
  const rex = await send('PUT', '/api/namespaces/default/agents/rex', { metadata: { resourceVersion: 'x' }, spec: {} });
  assert.equal(rex.status, 422, "the repository's agent is no write of the api's");
});

test("a builder's save round-trips its spec, the step files keep only their own keys, a stale version is a 409 and a cycle a 422 naming its steps", async () => {
  const read = (await get<Obj>(`${W}/mine?origin=user`)).body;
  const steps = read.spec.steps ?? [];
  assert.deepEqual(
    steps.map((s) => [s.name, s.keys]),
    [
      ['make', { after: ['plan'], place: 'git', agent: 'implementer' }],
      ['plan', { place: 'git', harness: 'claude' }],
    ],
  );
  const saved = await send('PUT', `${L}/mine`, { metadata: { resourceVersion: read.metadata.resourceVersion }, spec: { steps } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.kind, 'Workflow');
  assert.deepEqual(saved.body.spec.steps, steps);
  assert.doesNotMatch(fs.readFileSync(path.join(STORE, 'mine', 'make.md'), 'utf8'), /model:/, "the agent's keys stay its own");
  const stale = await send('PUT', `${L}/mine`, { metadata: { resourceVersion: read.metadata.resourceVersion + 'x' }, spec: { steps } });
  assert.equal(stale.status, 409);
  const now = (await get<Obj>(`${W}/mine?origin=user`)).body.metadata.resourceVersion;
  const cycle = steps.map((s) => (s.name === 'plan' ? { ...s, keys: { ...s.keys, after: ['make'] } } : s));
  const refused = await send('PUT', `${L}/mine`, { metadata: { resourceVersion: now }, spec: { steps: cycle } });
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.body.steps, ['make', 'plan']);
});

test('a workflow of yours made with its first step (201), then removed at the version read', async () => {
  const made = await send('POST', L, {
    metadata: { name: 'fresh' },
    spec: { steps: [{ name: 'only', keys: { place: 'git' }, body: 'Do it.' }] },
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.status.origin, 'user');
  const missing = await send('DELETE', `${L}/fresh`);
  assert.equal(missing.status, 422, 'a removal says the version it read');
  const gone = await send('DELETE', `${L}/fresh?resourceVersion=${made.body.metadata.resourceVersion}`);
  assert.equal(gone.status, 200, JSON.stringify(gone.body));
  assert.equal(fs.existsSync(path.join(STORE, 'fresh')), false);
});

test('an agent of yours made (201), tried (201), and its removal refused while a step names it (409, with its users)', async () => {
  const made = await send('POST', '/api/agents', {
    metadata: { name: 'tess' },
    spec: { keys: { harness: 'claude' }, instructions: 'You test.' },
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual([made.body.kind, made.body.status.origin], ['Agent', 'user']);
  const tried = await send('POST', '/api/agents/tess/try', { brief: 'Test the cache.' });
  assert.equal(tried.status, 201, JSON.stringify(tried.body));
  assert.equal(typeof tried.body.id, 'string');
  const implementer = (await get<Obj>('/api/namespaces/default/agents/implementer?origin=user')).body;
  const kept = await send('DELETE', `/api/agents/implementer?resourceVersion=${implementer.metadata.resourceVersion}`);
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
  const copied = await send('POST', `/api/skills/${name}/copy`);
  assert.equal(copied.status, 201, JSON.stringify(copied.body));
  assert.equal(copied.body.status.origin, 'user');
  const shadowed = (await get<Obj>(`/api/namespaces/default/skills/${name}?origin=builtin`)).body;
  assert.equal(shadowed.status.shadowedBy, 'user');
  const files = (await get<{ paths: string[] }>(`/api/namespaces/default/skills/${name}/files`)).body;
  assert.ok(files.paths.includes('SKILL.md'));
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

test('each retired path answers 404', async () => {
  const retired: Array<[string, string]> = [
    ['POST', '/api/workflows/yours'],
    ['PUT', '/api/workflows/yours/mine'],
    ['DELETE', '/api/workflows/yours/mine'],
    ['GET', '/api/agents/yours/implementer'],
    ['PUT', '/api/agents/yours/implementer'],
    ['DELETE', '/api/agents/yours/implementer'],
    ['POST', '/api/agents/yours'],
    ['GET', '/api/agents/yours/implementer/card'],
    ['POST', '/api/agents/yours/implementer/try'],
    ['GET', '/api/skills/yours/x'],
    ['PUT', '/api/skills/yours/x'],
    ['POST', '/api/skills/yours'],
  ];
  for (const [method, url] of retired) {
    const res = await app.request(url, { method, headers: json, ...(method !== 'GET' && { body: '{}' }) });
    assert.equal(res.status, 404, `${method} ${url}`);
  }
});

test("each served resourceVersion is the number a run's start pins: past the first as the workflow, its agent and the agent's skill change, a skill's edit moving the other two", async () => {
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
  const pinnedAtStart = async () => {
    const started = await send('POST', '/api/namespaces/works/runs', { workflow: 'mine', from: 'user', brief: 'Make the plan.' });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    const pins = runsNow(root).runs.read(String(started.body.id)).pinned ?? [];
    return Object.fromEntries(pins.map((p) => [`${p.kind}/${p.name}`, p.n]));
  };
  const served = async () => ({
    'workflow/mine': Number((await get<Obj>(`${W}/mine?origin=user`)).body.metadata.resourceVersion),
    'agent/implementer': Number((await get<Obj>('/api/namespaces/default/agents/implementer?origin=user')).body.metadata.resourceVersion),
    'skill/notes': Number((await get<Obj>('/api/namespaces/default/skills/notes?origin=user')).body.metadata.resourceVersion),
  });
  const kinds = (pins: Record<string, number>) => ({
    'workflow/mine': pins['workflow/mine'],
    'agent/implementer': pins['agent/implementer'],
    'skill/notes': pins['skill/notes'],
  });
  const first = kinds(await pinnedAtStart());
  assert.deepEqual(await served(), first, 'the first start pins each kind at the revision it is served at');
  write(path.join(STORE, 'mine', 'plan.md'), '---\nplace: git\nagent: implementer\n---\nWrite PLAN.md, and say why.\n');
  write(
    path.join(STORE, 'agents', 'implementer.md'),
    '---\nharness: claude\nmodel: opus\nskills: notes\n---\nYou make what the plan says, tested.\n',
  );
  const second = kinds(await pinnedAtStart());
  assert.deepEqual(await served(), second, 'a start after the edit pins each at its new served revision');
  assert.ok(second['workflow/mine']! > first['workflow/mine']!, 'the workflow moved past its first revision');
  assert.ok(second['agent/implementer']! > first['agent/implementer']!, 'and so did the agent');
  assert.equal(second['skill/notes'], first['skill/notes'], 'the skill nobody edited kept its revision');
  write(path.join(STORE, 'skills', 'notes', 'SKILL.md'), '---\nname: notes\ndescription: Keeps notes.\n---\nKeep notes, dated.\n');
  const third = kinds(await pinnedAtStart());
  assert.deepEqual(await served(), third, 'each served revision is the pin');
  assert.ok(third['skill/notes']! > second['skill/notes']!, "a skill's edit moves its own revision");
  assert.ok(third['agent/implementer']! > second['agent/implementer']!, "and the agent's, which gives it");
  assert.ok(third['workflow/mine']! > second['workflow/mine']!, "and the workflow's, which names the agent");
});
