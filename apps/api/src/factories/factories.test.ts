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
import { config, root } from '../../test/harness.ts';
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
  clearSchedule,
  factoryNameRefusal,
  hireAgent,
  loadWorkflows,
  noFactoryLine,
  readInbox,
  removeFactory,
  runStore,
  setSchedule,
  hireRefusalOf,
  unattachedRefusal,
  unfilledRefusal,
} from 'agent-orchestrator';

type WorkflowListing = import('../workflows/workflows.ts').WorkflowListing;
type WorkflowStepPage = import('../step/step.ts').WorkflowStepPage;
type FactoryAnswer = import('./factories.ts').FactoryAnswer;
type RunPage = import('../runs/runs.ts').RunPage;
type RunListing = import('../runs/runs.ts').RunListing;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A git repository with one commit, as `nemia start` reads its HEAD. */
const gitRepo = (prefix: string): string => {
  const repo = scratch(prefix);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
  return repo;
};

const own = gitRepo('nemia-api-own-');
process.env.HKB_REPO = own;
write(path.join(own, 'workflows', 'beta', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');

const repoR = gitRepo('nemia-api-factory-r-');
write(path.join(repoR, 'workflows', 'alpha', 'implement.md'), '---\nplace: git\nharness: claude\n---\nImplement it.\n');
write(path.join(repoR, 'workflows', 'gamma', 'plan.md'), '---\nplace: git\n---\nPlan it.\n');
write(path.join(repoR, 'workflows', 'agents', 'ada.md'), '---\nharness: claude\n---\nYou implement what you are asked.\n');
const repoS = gitRepo('nemia-api-factory-s-');

const stranger = scratch('nemia-api-stranger-');
write(path.join(stranger, 'workflows', 'x', 'step.md'), '---\nplace: git\n---\nDo it.\n');
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

test("REFUSED at shipped defaults: a ?repo= that is neither the api's own nor any factory's is a 422 naming those it may be and `nemia factory add` — and nothing of it is listed", async () => {
  const { status, body } = await get<unknown>(`/api/workflows?repo=${encodeURIComponent(stranger)}`);
  assert.equal(status, 422);
  assert.equal(
    said(body),
    `${stranger}: the api serves its own repository and those of the factories in the store — ${[own, repoR, repoS].join(', ')} — and this is none of them. Name one of them with ?repo=, or file a factory for it: nemia factory add <name> --repo ${stranger}.`,
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
    `${stranger}: the api serves its own repository and those of the factories in the store — ${[own, repoR, repoS].join(', ')} — and this is none of them. Name one of them with ?repo=, or file a factory for it: nemia factory add <name> --repo ${stranger}.`,
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

test("REFUSED at shipped defaults: a repository outside the factory named is a 422 naming the factory's, the ?repo= that asks for one and the add that files one on it — given, or the api's own when the factory has two", async () => {
  const sorted = [repoR, repoS].sort();
  const named = await get<unknown>(`/api/workflows?factory=pair&repo=${encodeURIComponent(own)}`);
  assert.equal(named.status, 422);
  assert.equal(
    said(named.body),
    `${own}: the factory pair works on ${sorted.join(', ')}, and this repository is not one of them. Name one of them — ?factory=pair&repo=${sorted[0]} — or file a factory on this one: nemia factory add <name> --repo ${own}.`,
  );
  assert.doesNotMatch(said(named.body), /default factory/, "only the factory's own fix");
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
  assert.match(solo[0].unfilled ?? '', /nemia factory hire solo <agent> --step alpha\/implement/);
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
  assert.deepEqual(
    [page.body.factory, page.body.hired, page.body.layers.agent, page.body.layers.instructions, page.body.hiredIn],
    ['hired', 'ada', 'ada', 'You implement what you are asked.', []],
    'the factory hires ada into the step: the page marks it hired, and what a run would be told starts from her instructions',
  );
  const unhired = await get<WorkflowStepPage>('/api/workflows/repo/alpha/implement?factory=solo');
  assert.equal(unhired.body.keys.find((k) => k.key === 'agent')?.value, null);
  assert.deepEqual([unhired.body.hired, unhired.body.layers.agent], [null, null], 'a factory that hires no one into it hires no one');

  const plain = await get<WorkflowStepPage>(`/api/workflows/repo/alpha/implement?repo=${encodeURIComponent(repoR)}`);
  assert.deepEqual(
    [plain.body.factory, plain.body.hired, plain.body.layers.agent],
    [null, null, null],
    "in the default factory the step is the file's: no agent",
  );
  assert.deepEqual(plain.body.hiredIn, [{ factory: 'hired', agent: 'ada' }], 'and the factories that hire into it are named');

  assert.deepEqual(
    [page.body.hiring, unhired.body.hiring],
    [
      { refused: null, agents: [{ name: 'ada', description: null }] },
      { refused: null, agents: [{ name: 'ada', description: null }] },
    ],
    "in a factory that offers the workflow, the step may be hired the repository's agents",
  );
  assert.deepEqual(plain.body.hiring, { refused: hireRefusalOf(undefined, 'alpha', null), agents: [] }, 'the default factory hires no one');

  const gamma = await get<unknown>('/api/workflows/repo/gamma/plan?factory=hired');
  assert.equal(gamma.status, 404);
  assert.equal(said(gamma.body), unattachedRefusal({ name: 'hired', workflows: ['alpha'] }, 'gamma'));
  assert.doesNotMatch(said(gamma.body), /default factory/, "only the factory's own fix");
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

  const listed = await get<RunListing[]>('/api/runs');
  assert.equal(listed.body.find((r) => r.id === id)?.factory, 'hired', 'the list names the factory the run is in');

  const address = { from: 'repo', workflow: 'alpha', factory: 'hired', repo: repoR };
  assert.deepEqual(
    listed.body.find((r) => r.id === id)?.workflowPage,
    address,
    "the list gives the address of the run's workflow page, in its factory",
  );
  const detail = await get<RunPage>(`/api/runs/${id}`);
  assert.deepEqual(detail.body.workflowPage, address, 'and so does its page');

  const page = await get<WorkflowStepPage>('/api/workflows/repo/alpha/implement?factory=hired');
  assert.deepEqual(
    page.body.recentRuns.map((r) => [r.id, r.brief, r.factory]),
    [[id, 'Add a cache', 'hired']],
    "the step's page lists the run among its recent runs",
  );
  const elsewhere = await get<WorkflowStepPage>('/api/workflows/repo/alpha/implement?factory=solo');
  assert.ok(!elsewhere.body.recentRuns.some((r) => r.id === id), "and only in its factory: another factory's page does not");
});

test('POST /api/runs?factory= starts a card in the factory: the record names the factory, its repository and the card, and the card leaves the inbox', async () => {
  const { card } = addToInbox({ text: 'Cache the views' });
  const res = await post('/api/runs?factory=hired', { workflow: 'alpha', card: card.name });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = (await res.json()) as { id: string };
  const run = runStore.runs.read(id);
  assert.deepEqual([run.factory, run.repo, run.from?.inbox], ['hired', repoR, card.name]);
  assert.ok(!readInbox().some((c) => c.name === card.name), 'the card has left the inbox');
});

test("REFUSED at shipped defaults: a card started in a factory whose hires leave the workflow's steps unfilled is a 422 in `startRun`'s words, the card stays and nothing is written", async () => {
  const { card } = addToInbox({ text: 'Cache the lists' });
  const before = runFiles();
  const res = await post('/api/runs?factory=solo', { workflow: 'alpha', card: card.name });
  assert.equal(res.status, 422);
  assert.equal(said(await res.json()), unfilledRefusal(loadWorkflows(path.join(repoR, 'workflows', 'alpha')), 'solo', 'alpha'));
  assert.ok(
    readInbox().some((c) => c.name === card.name),
    'the card is still there',
  );
  assert.deepEqual(runFiles(), before, 'nothing written');
});

test("the request's factory comes before the card's `factory:`: a card of hired started with ?factory=solo is refused as solo's, and stays", async () => {
  const { card } = addToInbox({ text: 'Cache the pages', factory: 'hired' });
  const before = runFiles();
  const res = await post('/api/runs?factory=solo', { workflow: 'alpha', card: card.name });
  assert.equal(res.status, 422, 'started in hired, the card would have run: hired fills alpha');
  assert.equal(said(await res.json()), unfilledRefusal(loadWorkflows(path.join(repoR, 'workflows', 'alpha')), 'solo', 'alpha'));
  assert.ok(
    readInbox().some((c) => c.name === card.name),
    'the card is still there',
  );
  assert.deepEqual(runFiles(), before, 'nothing written');
});

/**
 * The switch off, as shipped, for the test `t`, and the factory `trio` filed on a repository of its own whose workflow `delta` names its
 * agent in its step: removed, with the switch put back, once the test ends.
 */
function asShipped(t: { after: (fn: () => void) => void }): string {
  const was = process.env.WF_DEFAULT_FACTORY_STARTS;
  delete process.env.WF_DEFAULT_FACTORY_STARTS;
  const repoT = gitRepo('nemia-api-factory-t-');
  write(path.join(repoT, 'workflows', 'delta', 'implement.md'), '---\nplace: git\nharness: claude\nagent: ada\n---\nImplement it.\n');
  write(path.join(repoT, 'workflows', 'agents', 'ada.md'), '---\nharness: claude\n---\nYou implement what you are asked.\n');
  addFactory({ name: 'trio', repos: [repoT] });
  attachWorkflow({ factory: 'trio', workflow: 'delta' });
  t.after(() => {
    removeFactory('trio');
    if (was === undefined) delete process.env.WF_DEFAULT_FACTORY_STARTS;
    else process.env.WF_DEFAULT_FACTORY_STARTS = was;
  });
  return repoT;
}

test('as shipped, POST /api/runs with no ?factory= starts the run in the one factory whose repository holds ?repo=, on it', async (t) => {
  const repoT = asShipped(t);
  const res = await post(`/api/runs?repo=${encodeURIComponent(repoT)}`, { workflow: 'delta', brief: 'Add a cache' });
  assert.equal(res.status, 201, await res.clone().text());
  const run = runStore.runs.read(((await res.json()) as { id: string }).id);
  assert.deepEqual([run.factory, run.repo], ['trio', repoT]);
});

test('REFUSED as shipped: POST /api/runs with no ?factory= on a repository three factories hold, or one none holds, is a 422 naming ?factory=, and nothing is written', async (t) => {
  asShipped(t);
  const before = runFiles();
  const shared = await post(`/api/runs?repo=${encodeURIComponent(repoR)}`, { workflow: 'alpha', brief: 'Add a cache' });
  assert.equal(shared.status, 422);
  assert.match(
    said(await shared.json()),
    /^\S+: 3 factories work on this folder — hired on \S+, pair on \S+, solo on \S+ — .* Name the one: \?factory=hired, or \?factory=pair, or \?factory=solo\. Nothing was started\.$/,
  );
  const loose = await post('/api/runs', { workflow: 'beta', brief: 'Add a cache' });
  assert.equal(loose.status, 422);
  assert.match(
    said(await loose.json()),
    new RegExp(`^${own}: no factory works on this folder, .* Name the factory — \\?factory=<name>, one of `),
  );
  assert.deepEqual(runFiles(), before, 'nothing written');
});

test('REFUSED: POST /api/runs?factory=default, of a workflow or a card, is a 422 naming ?factory=<name>, even with WF_DEFAULT_FACTORY_STARTS=1, though one factory alone holds the repository; nothing is written and the card stays', async (t) => {
  const repoT = asShipped(t);
  process.env.WF_DEFAULT_FACTORY_STARTS = '1';
  const { card } = addToInbox({ text: 'Cache the trios', factory: 'trio' });
  const before = runFiles();
  const url = `/api/runs?factory=default&repo=${encodeURIComponent(repoT)}`;
  for (const body of [
    { workflow: 'delta', brief: 'Add a cache' },
    { workflow: 'delta', card: card.name },
  ]) {
    const res = await post(url, body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.match(
      said(await res.json()),
      /^`default` is the default factory: .* Name a factory — \?factory=<name>, one of .*\. Nothing was started\.$/,
      JSON.stringify(body),
    );
  }
  assert.ok(
    readInbox().some((c) => c.name === card.name),
    'the card is still there',
  );
  assert.deepEqual(runFiles(), before, 'nothing written');
});

test('REFUSED as shipped: a card that names no factory is a 422 naming ?factory=, though one factory alone holds the repository it is started on; the card stays', async (t) => {
  const repoT = asShipped(t);
  const { card } = addToInbox({ text: 'Cache the trios' });
  const before = runFiles();
  const res = await post(`/api/runs?repo=${encodeURIComponent(repoT)}`, { workflow: 'delta', card: card.name });
  assert.equal(res.status, 422);
  assert.match(said(await res.json()), /: this card names no factory, .*, or name it at start: \?factory=<name>; /);
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
    const commandsOf = (name: string) => ({
      attach: `nemia factory attach ${name} <workflow>`,
      rm: `nemia factory rm ${name}`,
      add: `nemia factory add ${name} --repo <path>`,
      schedule: `nemia factory schedule ${name} <workflow> --cron <expr> --brief <text>`,
      trust: `nemia factory trust ${name}`,
    });
    assert.deepEqual(body[0], {
      name: 'default',
      default: true,
      repos: [own],
      workflows: null,
      hires: {},
      error: null,
      schedules: [],
      template: null,
      untrusted: [],
      commands: commandsOf('default'),
    });
    assert.deepEqual(body[2].untrusted, [
      {
        place: repoR,
        harness: 'Claude Code',
        withheld: `the allow rules of ${repoR}/.claude/settings.json, for a session started there or in a worktree of it, and the start of a background session there`,
        never: null,
      },
    ]);
    assert.deepEqual(
      body[3].untrusted.map((u) => u.place),
      [repoR, repoS],
    );
    assert.deepEqual(body[1].untrusted, [], 'a file that does not read names no place');
    fs.writeFileSync(path.join(config, '.claude.json'), JSON.stringify({ projects: { [repoR]: { hasTrustDialogAccepted: true } } }));
    const trusting = (await get<FactoryAnswer[]>('/api/factories')).body;
    assert.deepEqual(trusting[2].untrusted, [], 'trusted, nothing is said');
    assert.deepEqual(
      trusting[3].untrusted.map((u) => u.place),
      [repoS],
    );
    fs.rmSync(path.join(config, '.claude.json'));
    assert.deepEqual(
      { ...body[2], untrusted: [] },
      {
        name: 'hired',
        default: false,
        repos: [repoR],
        workflows: ['alpha'],
        hires: { 'alpha/implement': 'ada' },
        error: null,
        schedules: [],
        template: null,
        untrusted: [],
        commands: commandsOf('hired'),
      },
    );
    assert.deepEqual(body[1].commands, commandsOf('broken'), 'a file that does not read is filed again by the same lines');
    assert.deepEqual(body[3].repos, [repoR, repoS]);
    assert.equal(body[1].default, false);
    assert.match(body[1].error ?? '', /is not JSON/);
    assert.deepEqual([body[1].repos, body[1].workflows, body[1].hires, body[1].schedules, body[1].template], [[], [], {}, [], null]);
  } finally {
    fs.rmSync(path.join(root, 'factories', 'broken.json'));
  }
});

test("GET /api/factories serves a templated factory's template: not applied before the daemon renders it, then the version and conditions it wrote", async () => {
  addFactory({ name: 'shaped', repos: [repoR], template: { source: '/t/team', version: '0.1.0', params: { budget: 7 } } });
  const shaped = async () => (await get<FactoryAnswer[]>('/api/factories')).body.find((f) => f.name === 'shaped')?.template;
  try {
    assert.deepEqual(await shaped(), { source: '/t/team', version: '0.1.0', params: { budget: 7 }, applied: null, conditions: [] });
    const drift = { type: 'Applied', status: 'False', reason: 'VersionDrift', message: 'The template is at version 0.2.0.' };
    const pending = { type: 'ConflictsPending', status: 'False', reason: 'NoUpgrade', message: 'No upgrade is under way.' };
    write(
      path.join(root, 'factories', 'shaped', 'status.json'),
      JSON.stringify({ version: '0.1.0', digest: 'sha256:0', params: { budget: 7 }, conditions: [drift, pending] }),
    );
    assert.deepEqual(await shaped(), {
      source: '/t/team',
      version: '0.1.0',
      params: { budget: 7 },
      applied: '0.1.0',
      conditions: [drift, pending],
    });
  } finally {
    removeFactory('shaped');
  }
});

test("a templated factory's workflows are its tree's, before its repository's: listed, paged and started from the tree", async () => {
  addFactory({ name: 'treed', repos: [repoR], template: { source: '/t/team', version: '0.1.0', params: {} } });
  const tree = path.join(root, 'factories', 'treed', 'tree');
  write(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['alpha', 'gamma'], hires: {} }));
  write(path.join(tree, 'workflows', 'alpha', 'implement.md'), '---\nplace: git\nagent: ada\n---\nImplement it, as the tree says.\n');
  write(path.join(tree, 'workflows', 'agents', 'ada.md'), '---\nharness: claude\n---\nYou implement what the tree asks.\n');
  try {
    const { body } = await get<WorkflowListing[]>('/api/workflows?factory=treed');
    assert.deepEqual(
      body.map((w) => [w.from, w.name, w.dir]),
      [
        ['repo', 'alpha', path.join(tree, 'workflows', 'alpha')],
        ['repo', 'gamma', path.join(repoR, 'workflows', 'gamma')],
      ],
      "alpha is the tree's, which shadows the repository's; gamma, which the tree has not, is the repository's",
    );
    const page = await get<WorkflowStepPage>('/api/workflows/repo/alpha/implement?factory=treed');
    assert.equal(page.status, 200);
    assert.equal(page.body.dir, path.join(tree, 'workflows', 'alpha'));
    assert.match(page.body.source, /Implement it, as the tree says\./, "the tree's step file, as written");

    const res = await post('/api/runs?factory=treed', { workflow: 'alpha', brief: 'Add a cache' });
    assert.equal(res.status, 201, await res.clone().text());
    const run = runStore.runs.read(((await res.json()) as { id: string }).id);
    assert.deepEqual([run.factory, run.repo, run.workflowDir], ['treed', repoR, path.join(tree, 'workflows', 'alpha')]);
  } finally {
    removeFactory('treed');
  }
});

test("GET /api/factories answers a factory's schedules with their next fire and last scheduled run, as the package lists them, and the line that takes each back", async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-08T12:00:00Z') });
  setSchedule({ factory: 'solo', workflow: 'alpha', cron: '0 9 * * 1', tz: 'America/Montreal', brief: 'Read the stats' });
  const record = path.join(root, 'runs', 'r-scheduled.json');
  write(
    record,
    JSON.stringify({
      id: 'r-scheduled',
      repo: repoR,
      baseRef: 'main',
      workspace: repoR,
      branch: 'main',
      isolate: true,
      brief: 'Read the stats',
      createdAt: '2026-10-05T13:00:02.000Z',
      workflowDir: path.join(repoR, 'workflows', 'alpha'),
      workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
      steps: {},
      factory: 'solo',
      scheduled: { factory: 'solo', workflow: 'alpha', due: '2026-10-05T13:00:00.000Z' },
    }),
  );
  try {
    const { status, body } = await get<FactoryAnswer[]>('/api/factories');
    assert.equal(status, 200);
    const solo = body.find((f) => f.name === 'solo');
    assert.deepEqual(solo?.schedules, [
      {
        workflow: 'alpha',
        cron: '0 9 * * 1',
        tz: 'America/Montreal',
        brief: 'Read the stats',
        repo: null,
        next: '2026-10-12T13:00:00.000Z',
        last: { run: 'r-scheduled', at: '2026-10-05T13:00:02.000Z' },
        refused: null,
        commands: { unschedule: 'nemia factory unschedule solo alpha' },
      },
    ]);
    assert.deepEqual(
      body.filter((f) => f.name !== 'solo').map((f) => f.schedules),
      body.filter((f) => f.name !== 'solo').map(() => []),
      'the default factory, and every factory with none, answers no schedule',
    );
  } finally {
    clearSchedule({ factory: 'solo', workflow: 'alpha' });
    fs.rmSync(record);
  }
});

test("REFUSED at shipped defaults: a schedule's PUT with a cron Effect's Cron does not read is a 422 in the package's words, and nothing is scheduled", async () => {
  const res = await app.request('/api/factories/solo/schedules/alpha', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cron: 'not a cron', brief: 'Read the stats' }),
  });
  assert.equal(res.status, 422);
  assert.match(said(await res.json()), /not a cron/);
  const { body } = await get<FactoryAnswer[]>('/api/factories');
  assert.deepEqual(body.find((f) => f.name === 'solo')?.schedules, []);
});

test("a schedule PUT on the factory's route is listed on GET /api/factories and taken back by its DELETE; REFUSED: a cron that is no string is a 400 naming it", async () => {
  const route = '/api/factories/solo/schedules/alpha';
  const json = { 'content-type': 'application/json' };
  const wrong = await app.request(route, { method: 'PUT', headers: json, body: JSON.stringify({ cron: 9, brief: 'Read the stats' }) });
  assert.equal(wrong.status, 400);
  assert.match(
    said(await wrong.json()),
    /^PUT \/api\/factories\/solo\/schedules\/alpha: `cron` is the cron its runs start at.* This request's was 9\.$/,
  );
  const put = await app.request(route, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify({ cron: '0 9 * * 1', brief: 'Read the stats' }),
  });
  assert.equal(put.status, 200, said(await put.clone().json()));
  const listed = (await get<FactoryAnswer[]>('/api/factories')).body.find((f) => f.name === 'solo')?.schedules;
  assert.deepEqual(
    listed?.map((s) => [s.workflow, s.cron, s.brief, s.commands.unschedule]),
    [['alpha', '0 9 * * 1', 'Read the stats', 'nemia factory unschedule solo alpha']],
  );
  const del = await app.request(route, { method: 'DELETE', headers: json, body: '{}' });
  assert.equal(del.status, 200);
  assert.deepEqual((await get<FactoryAnswer[]>('/api/factories')).body.find((f) => f.name === 'solo')?.schedules, []);
});
