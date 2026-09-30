/**
 * A request answered in a factory and on a repository (`placeFor`, place.ts): the workflows listed and a step's page read as the factory
 * offers them, a run started in it, the factories served, and every other repository refused — at shipped defaults, in a scratch store
 * (`WF_ROOT`) whose factories are filed with the package's own verbs.
 *
 * The api's own repository (`HKB_REPO`) has the workflow `beta`. `repoR`, a git repository, has `alpha`, whose step `implement` names no
 * agent, and `gamma`, and the agent `ada` beside them; `repoS` is a second repository. `solo` works on `repoR` alone and attaches `alpha`,
 * hiring no one; `hired` does the same, and hires `ada` into `alpha/implement`; `pair` works on both. `stranger` is a directory no factory
 * names, with a workflow and an MCP server of its own, which the api must never read nor start.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
import {
  addFactory,
  addToInbox,
  attachWorkflow,
  factoryNameRefusal,
  hireAgent,
  loadWorkflows,
  noFactoryLine,
  readInbox,
  removeFactory,
  runStore,
  unattachedRefusal,
  unfilledRefusal,
} from 'agent-orchestrator';

type WorkflowListing = import('../workflows/workflows.ts').WorkflowListing;
type WorkflowStepPage = import('../workflows/workflows.ts').WorkflowStepPage;
type RunSummary = import('../runs/runs.ts').RunSummary;
type FactoryAnswer = import('./factories.ts').FactoryAnswer;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A git repository with one commit, as `wf start` reads its HEAD. */
const gitRepo = (prefix: string): string => {
  const repo = scratch(prefix);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
  return repo;
};

const own = gitRepo('nemia-api-own-');
process.env.HKB_REPO = own;
write(path.join(own, 'workflows', 'beta', 'implement.md'), 'Implement it.\n');

const repoR = gitRepo('nemia-api-factory-r-');
write(path.join(repoR, 'workflows', 'alpha', 'implement.md'), '---\nharness: claude\n---\nImplement it.\n');
write(path.join(repoR, 'workflows', 'gamma', 'plan.md'), 'Plan it.\n');
write(path.join(repoR, 'workflows', 'agents', 'ada.md'), '---\nharness: claude\n---\nYou implement what you are asked.\n');
const repoS = gitRepo('nemia-api-factory-s-');

const stranger = scratch('nemia-api-stranger-');
write(path.join(stranger, 'workflows', 'x', 'step.md'), 'Do it.\n');
const starts = path.join(stranger, 'starts');
const FIXTURE_SERVER = path.join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'mcp-server.ts');
write(
  path.join(stranger, '.mcp.json'),
  JSON.stringify({ mcpServers: { local: { command: process.execPath, args: [FIXTURE_SERVER], env: { HKB_TEST_STARTS: starts } } } }),
);
write(path.join(stranger, '.claude', 'settings.json'), JSON.stringify({ enabledMcpjsonServers: ['local'] }));

for (const [name, repos] of [
  ['solo', [repoR]],
  ['hired', [repoR]],
  ['pair', [repoR, repoS]],
] as const) {
  addFactory({ name, repos });
  attachWorkflow({ factory: name, workflow: 'alpha' });
}
hireAgent({ factory: 'hired', agent: 'ada', step: 'alpha/implement' });

const get = async <T>(url: string): Promise<{ status: number; body: T }> => {
  const res = await app.request(url);
  return { status: res.status, body: (await res.json()) as T };
};
const said = (body: unknown): string => (body as { error: string }).error;
const names = (listings: WorkflowListing[]): string[] => listings.map((w) => w.name);
const runFiles = (): string[] => (fs.existsSync(path.join(root, 'runs')) ? fs.readdirSync(path.join(root, 'runs')).sort() : []);

const post = (url: string, body: unknown) =>
  app.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test("REFUSED at shipped defaults: a ?repo= that is neither the api's own nor any factory's is a 422 naming those it may be and `wf factory add` — and nothing of it is listed", async () => {
  const { status, body } = await get<unknown>(`/api/workflows?repo=${encodeURIComponent(stranger)}`);
  assert.equal(status, 422);
  assert.equal(
    said(body),
    `${stranger}: the api serves its own repository and those of the factories in the store — ${[own, repoR, repoS].join(', ')} — and this is none of them. Name one of them with ?repo=, or file a factory for it: wf factory add <name> --repo ${stranger}.`,
  );
  assert.ok(!JSON.stringify(body).includes('"x"'), 'the workflow x in it is never listed');
});

test('REFUSED at shipped defaults: capabilities for a ?repo= no factory names is a 422, and the MCP server its .mcp.json enables is never started — as it is once a factory names the directory', async () => {
  const refused = await app.request(`/api/capabilities?repo=${encodeURIComponent(stranger)}`);
  assert.equal(refused.status, 422);
  assert.equal(fs.existsSync(starts), false, 'no server of the stranger started');

  addFactory({ name: 'strange', repos: [stranger] });
  try {
    const served = await app.request(`/api/capabilities?repo=${encodeURIComponent(stranger)}`);
    assert.equal(served.status, 200, 'the same request, once a factory names the directory, is served');
    assert.ok(fs.existsSync(starts), 'and its server is started: the fixture starts when the repository is served');
  } finally {
    removeFactory('strange');
  }
});

test("in the default factory, a factory's repository is served: ?repo= lists its workflows, and not the api's own", async () => {
  const { status, body } = await get<WorkflowListing[]>(`/api/workflows?repo=${encodeURIComponent(repoR)}`);
  assert.equal(status, 200);
  assert.deepEqual(
    body.filter((w) => w.from === 'repo').map((w) => w.name),
    ['alpha', 'gamma'],
    'every workflow of the repository: the default factory offers them all',
  );
  assert.deepEqual(
    body.map((w) => w.unfilled),
    body.map(() => null),
    'nothing is unfilled in the default factory',
  );
  const { body: plain } = await get<WorkflowListing[]>('/api/workflows');
  assert.deepEqual(
    plain.filter((w) => w.from === 'repo').map((w) => w.name),
    ['beta'],
    'a request naming neither is answered on the api own repository, as before',
  );
});

test('?factory=default is the default factory: the same answer as naming none, and a ?repo= no factory names is refused in it all the same', async () => {
  assert.deepEqual(await get<WorkflowListing[]>('/api/workflows?factory=default'), await get<WorkflowListing[]>('/api/workflows'));
  const { status, body } = await get<unknown>(`/api/workflows?factory=default&repo=${encodeURIComponent(stranger)}`);
  assert.equal(status, 422);
  assert.equal(
    said(body),
    `${stranger}: the api serves its own repository and those of the factories in the store — ${[own, repoR, repoS].join(', ')} — and this is none of them. Name one of them with ?repo=, or file a factory for it: wf factory add <name> --repo ${stranger}.`,
  );
});

test("REFUSED at shipped defaults: a factory the store does not have is a 404, and a name that is no factory's a 422, each in the package's words", async () => {
  const unknown = await get<unknown>('/api/workflows?factory=nope');
  assert.equal(unknown.status, 404);
  assert.ok(said(unknown.body).startsWith(noFactoryLine('nope', ['hired', 'pair', 'solo'])), said(unknown.body));
  const bad = await get<unknown>('/api/workflows?factory=Bad');
  assert.equal(bad.status, 422);
  assert.equal(said(bad.body), factoryNameRefusal('Bad'));
});

test("REFUSED at shipped defaults: a repository outside the factory named is a 422 naming the factory's and the ?repo= that asks for one — given, or the api's own when the factory has two", async () => {
  const sorted = [repoR, repoS].sort();
  const named = await get<unknown>(`/api/workflows?factory=pair&repo=${encodeURIComponent(own)}`);
  assert.equal(named.status, 422);
  assert.equal(
    said(named.body),
    `${own}: the factory pair works on ${sorted.join(', ')}, and this repository is not one of them. Name one of them — ?factory=pair&repo=${sorted[0]} — or ask in the default factory.`,
  );
  const fallen = await get<unknown>('/api/workflows?factory=pair');
  assert.equal(fallen.status, 422, 'two repositories: none is filled in, and the api own is not one of them');
  assert.ok(said(fallen.body).startsWith(`${own}: the factory pair works on`), said(fallen.body));
  const inside = await get<WorkflowListing[]>(`/api/workflows?factory=pair&repo=${encodeURIComponent(repoS)}`);
  assert.equal(inside.status, 200, 'one of its repositories is served');
});

test('a factory with one repository fills it in, and offers only the workflows attached to it', async () => {
  const { status, body } = await get<WorkflowListing[]>('/api/workflows?factory=solo');
  assert.equal(status, 200);
  assert.deepEqual(names(body), ['alpha'], "alpha from repoR: not gamma, which solo has not attached, nor the api's own beta");
  assert.equal(body[0].dir, path.join(repoR, 'workflows', 'alpha'));
});

test("`unfilled` names a step a factory's hires leave with no agent, in the package's words, and a hire fills it: the step then has the agent", async () => {
  const { body: solo } = await get<WorkflowListing[]>('/api/workflows?factory=solo');
  const steps = loadWorkflows(path.join(repoR, 'workflows', 'alpha'));
  assert.equal(solo[0].unfilled, unfilledRefusal(steps, 'solo', 'alpha'));
  assert.match(solo[0].unfilled ?? '', /wf factory hire solo <agent> --step alpha\/implement/);
  assert.equal(solo[0].steps[0].spec.agent, null);
  assert.equal(solo[0].steps[0].hired, null, 'solo hires no one into it');

  const { body: hired } = await get<WorkflowListing[]>('/api/workflows?factory=hired');
  assert.equal(hired[0].unfilled, null);
  assert.equal(hired[0].steps[0].spec.agent, 'ada');
  assert.equal(hired[0].steps[0].hired, 'ada', 'the listing says the agent is hired, not written in the step');
  assert.equal(hired[0].error, null);
});

test("a step's page in a factory is read with its hires, and a workflow the factory has not attached is a 404 in the package's words", async () => {
  const page = await get<WorkflowStepPage>('/api/workflows/repo/alpha/implement?factory=hired');
  assert.equal(page.status, 200);
  assert.equal(page.body.keys.find((k) => k.key === 'agent')?.value, 'ada');
  const unhired = await get<WorkflowStepPage>('/api/workflows/repo/alpha/implement?factory=solo');
  assert.equal(unhired.body.keys.find((k) => k.key === 'agent')?.value, null);

  const gamma = await get<unknown>('/api/workflows/repo/gamma/plan?factory=hired');
  assert.equal(gamma.status, 404);
  assert.equal(said(gamma.body), unattachedRefusal({ name: 'hired', workflows: ['alpha'] }, 'gamma'));
  const offered = await get<WorkflowStepPage>(`/api/workflows/repo/gamma/plan?repo=${encodeURIComponent(repoR)}`);
  assert.equal(offered.status, 200, 'the default factory offers it');
});

test('POST /api/runs?factory= starts the run in the factory: its record names the factory and its repository — and a step left unfilled is refused, with nothing written', async () => {
  const before = runFiles();
  const refused = await post('/api/runs?factory=solo', { workflow: 'alpha', brief: 'Add a cache' });
  assert.equal(refused.status, 422);
  assert.equal(said(await refused.json()), unfilledRefusal(loadWorkflows(path.join(repoR, 'workflows', 'alpha')), 'solo', 'alpha'));
  assert.deepEqual(runFiles(), before, 'nothing written');

  const res = await post('/api/runs?factory=hired', { workflow: 'alpha', brief: 'Add a cache' });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = (await res.json()) as { id: string };
  const run = runStore.runs.read(id);
  assert.deepEqual([run.factory, run.repo, run.workflowDir], ['hired', repoR, path.join(repoR, 'workflows', 'alpha')]);

  const listed = await get<RunSummary[]>('/api/runs');
  assert.equal(listed.body.find((r) => r.id === id)?.factory, 'hired', 'the list names the factory the run is in');
});

test('REFUSED at shipped defaults: a card started in a factory is a 422 in the words of `wf start --factory`, and the card stays in the inbox', async () => {
  const { card } = addToInbox({ text: 'Cache the views' });
  const before = runFiles();
  const res = await post('/api/runs?factory=hired', { workflow: 'alpha', card: card.name });
  assert.equal(res.status, 422);
  assert.match(
    said(await res.json()),
    /a card of the inbox is started in the default factory for now: a card does not name its factory yet/,
  );
  assert.ok(
    readInbox().some((c) => c.name === card.name),
    'the card is still there',
  );
  assert.deepEqual(runFiles(), before, 'nothing written');
});

test('GET /api/repository answers the repository a request is answered on: the api own, or the factory one', async () => {
  assert.deepEqual((await get<{ repo: string }>('/api/repository')).body, { repo: own });
  assert.deepEqual((await get<{ repo: string }>('/api/repository?factory=solo')).body, { repo: repoR });
});

test('GET /api/factories serves the default factory first, then each factory by name, and one whose file does not read with why, hiding no other', async () => {
  write(path.join(root, 'factories', 'broken.json'), '{ not json');
  try {
    const { status, body } = await get<FactoryAnswer[]>('/api/factories');
    assert.equal(status, 200);
    assert.deepEqual(
      body.map((f) => f.name),
      ['default', 'broken', 'hired', 'pair', 'solo'],
    );
    assert.deepEqual(body[0], { name: 'default', default: true, repos: [own], workflows: null, hires: {}, error: null });
    assert.deepEqual(body[2], {
      name: 'hired',
      default: false,
      repos: [repoR],
      workflows: ['alpha'],
      hires: { 'alpha/implement': 'ada' },
      error: null,
    });
    assert.deepEqual(body[3].repos, [repoR, repoS]);
    assert.equal(body[1].default, false);
    assert.match(body[1].error ?? '', /is not JSON/);
    assert.deepEqual([body[1].repos, body[1].workflows, body[1].hires], [[], [], {}]);
  } finally {
    fs.rmSync(path.join(root, 'factories', 'broken.json'));
  }
});
