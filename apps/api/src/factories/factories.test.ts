/**
 * A request answered in a factory and on a repository (`placeFor`, place.ts): one table of which repository and factory a request is
 * answered on and what is refused; a story of a person working in a factory with hires, from the listing to a run and a card started in
 * it; one table of the factory a start picks as shipped; and the stories of the factories served and of a schedule put and taken back —
 * in a scratch store (`WF_ROOT`) whose factories are filed with the package's own verbs.
 *
 * The api's own repository (`HKB_REPO`) has the workflow `beta`. `repoR`, a git repository, has `alpha`, whose step `implement` names no
 * agent, and `gamma`, and the agent `ada` beside them; `repoS` is a second repository. `solo` works on `repoR` alone and attaches `alpha`,
 * hiring no one; `hired` does the same, and hires `ada` into `alpha/implement`; `pair` works on both. `stranger` is a directory no factory
 * names, with a workflow and an MCP server of its own, which the api must never read nor start.
 */
import { config, root } from '../../test/harness.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { story } from '../../test/checkpoints.ts';
import { app } from '../app.ts';
import {
  addFactory,
  addToInbox,
  attachWorkflow,
  clearSchedule,
  hireAgent,
  loadWorkflows,
  readInbox,
  removeFactory,
  runStore,
  setSchedule,
  hireRefusalOf,
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

/** That `text` names every one of `facts`. */
const saysAll = (text: string, facts: string[]): void => {
  for (const fact of facts) assert.ok(text.includes(fact), `${fact}: ${text}`);
};

test('placeFor: the repository and the factory a request is answered on, and every other refused', async (t) => {
  await t.test(
    "a ?repo= that is neither the api's own nor any factory's is a 422 naming those it may be and the add — nothing of it listed",
    async () => {
      const { status, body } = await get<unknown>(`/api/workflows?repo=${encodeURIComponent(stranger)}`);
      assert.equal(status, 422);
      saysAll(said(body), [`${stranger}: `, [own, repoR, repoS].join(', '), '?repo=', `nemia factory add <name> --repo ${stranger}.`]);
      assert.ok(!JSON.stringify(body).includes('"x"'), 'the workflow x in it is never listed');
    },
  );

  await t.test(
    'capabilities for a ?repo= no factory names is a 422, its MCP server never started — as it is once a factory names it',
    async () => {
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
    },
  );

  await t.test("in the default factory, a factory's repository is served: ?repo= lists its workflows, and not the api's own", async () => {
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

  await t.test(
    '?factory=default is the same answer as naming none, and a ?repo= no factory names is refused in it all the same',
    async () => {
      assert.deepEqual(await get<WorkflowListing[]>('/api/workflows?factory=default'), await get<WorkflowListing[]>('/api/workflows'));
      const { status, body } = await get<unknown>(`/api/workflows?factory=default&repo=${encodeURIComponent(stranger)}`);
      assert.equal(status, 422);
      saysAll(said(body), [`${stranger}: `, [own, repoR, repoS].join(', '), `nemia factory add <name> --repo ${stranger}.`]);
    },
  );

  await t.test("a factory the store does not have is a 404, and a name that is no factory's a 422", async () => {
    assert.equal((await get<unknown>('/api/workflows?factory=nope')).status, 404);
    assert.equal((await get<unknown>('/api/workflows?factory=Bad')).status, 422);
  });

  await t.test(
    "a repository outside the factory is a 422 naming the factory's, the ?repo= and the add — given, or the api's own of two",
    async () => {
      const sorted = [repoR, repoS].sort();
      const named = await get<unknown>(`/api/workflows?factory=pair&repo=${encodeURIComponent(own)}`);
      assert.equal(named.status, 422);
      saysAll(said(named.body), [
        `${own}: the factory pair works on ${sorted.join(', ')}`,
        `?factory=pair&repo=${sorted[0]}`,
        `nemia factory add <name> --repo ${own}.`,
      ]);
      assert.doesNotMatch(said(named.body), /default factory/, "only the factory's own fix");
      const fallen = await get<unknown>('/api/workflows?factory=pair');
      assert.equal(fallen.status, 422, 'two repositories: none is filled in, and the api own is not one of them');
      assert.ok(said(fallen.body).startsWith(`${own}: the factory pair works on`), said(fallen.body));
      const inside = await get<WorkflowListing[]>(`/api/workflows?factory=pair&repo=${encodeURIComponent(repoS)}`);
      assert.equal(inside.status, 200, 'one of its repositories is served');
    },
  );

  await t.test('a factory with one repository fills it in, and offers only the workflows attached to it', async () => {
    const { status, body } = await get<WorkflowListing[]>('/api/workflows?factory=solo');
    assert.equal(status, 200);
    assert.deepEqual(names(body), ['alpha'], "alpha from repoR: not gamma, which solo has not attached, nor the api's own beta");
    assert.equal(body[0].dir, path.join(repoR, 'workflows', 'alpha'));
  });

  await t.test('GET /api/repository answers the repository a request is answered on: the api own, or the factory one', async () => {
    assert.deepEqual((await get<{ repo: string }>('/api/repository')).body, { repo: own });
    assert.deepEqual((await get<{ repo: string }>('/api/repository?factory=solo')).body, { repo: repoR });
  });
});

test('a person works in a factory with hires: the listing names what is unfilled, the step page its hires, and a run and a card start in it', async (t) => {
  const s = story(t);

  await s.test("`unfilled` names a step a factory's hires leave with no agent, in the package's words, and a hire fills it", async () => {
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

  await s.test(
    "a step's page in a factory is read with its hires, and a workflow it has not attached is a 404 naming its own fix alone",
    async () => {
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
      assert.deepEqual(
        plain.body.hiring,
        { refused: hireRefusalOf(undefined, 'alpha', null), agents: [] },
        'the default factory hires no one',
      );

      const gamma = await get<unknown>('/api/workflows/repo/gamma/plan?factory=hired');
      assert.equal(gamma.status, 404);
      assert.doesNotMatch(said(gamma.body), /default factory/, "only the factory's own fix");
      const offered = await get<WorkflowStepPage>(`/api/workflows/repo/gamma/plan?repo=${encodeURIComponent(repoR)}`);
      assert.equal(offered.status, 200, 'the default factory offers it');
    },
  );

  await s.test(
    'POST /api/runs?factory= starts the run in the factory, its record naming the factory and its repository; a step unfilled is refused',
    async () => {
      const before = runFiles();
      const refused = await post('/api/runs?factory=solo', { workflow: 'alpha', brief: 'Add a cache' });
      assert.equal(refused.status, 422);
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
    },
  );

  await s.test(
    'a card started in the factory: the record names the factory, its repository and the card, and the card stays, listed as started',
    async () => {
      const { card } = addToInbox({ text: 'Cache the views' });
      const res = await post('/api/runs?factory=hired', { workflow: 'alpha', card: card.name });
      assert.equal(res.status, 201, await res.clone().text());
      const { id } = (await res.json()) as { id: string };
      const run = runStore.runs.read(id);
      assert.deepEqual([run.factory, run.repo, run.from?.inbox], ['hired', repoR, card.name]);
      assert.equal(readInbox().find((c) => c.name === card.name)?.state, 'started', 'the card is kept, listed as started');
    },
  );

  await s.test(
    'REFUSED: a card started in a factory whose hires leave the workflow unfilled is a 422; the card stays, nothing written',
    async () => {
      const { card } = addToInbox({ text: 'Cache the lists' });
      const before = runFiles();
      const res = await post('/api/runs?factory=solo', { workflow: 'alpha', card: card.name });
      assert.equal(res.status, 422);
      assert.ok(
        readInbox().some((c) => c.name === card.name),
        'the card is still there',
      );
      assert.deepEqual(runFiles(), before, 'nothing written');
    },
  );

  await s.test(
    "the request's factory comes before the card's `factory:`: a card of hired started with ?factory=solo is refused as solo's",
    async () => {
      const { card } = addToInbox({ text: 'Cache the pages', factory: 'hired' });
      const before = runFiles();
      const res = await post('/api/runs?factory=solo', { workflow: 'alpha', card: card.name });
      assert.equal(res.status, 422, 'started in hired, the card would have run: hired fills alpha');
      assert.ok(
        readInbox().some((c) => c.name === card.name),
        'the card is still there',
      );
      assert.deepEqual(runFiles(), before, 'nothing written');
    },
  );
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

test('POST /api/runs as shipped: the factory a start with no ?factory= is filed in, or why it names none', async (t) => {
  await t.test('with no ?factory= the run starts in the one factory whose repository holds ?repo=, on it', async (t) => {
    const repoT = asShipped(t);
    const res = await post(`/api/runs?repo=${encodeURIComponent(repoT)}`, { workflow: 'delta', brief: 'Add a cache' });
    assert.equal(res.status, 201, await res.clone().text());
    const run = runStore.runs.read(((await res.json()) as { id: string }).id);
    assert.deepEqual([run.factory, run.repo], ['trio', repoT]);
  });

  await t.test(
    'REFUSED: on a repository three factories hold, or one none holds, a 422 naming ?factory=, and nothing is written',
    async (t) => {
      asShipped(t);
      const before = runFiles();
      const shared = await post(`/api/runs?repo=${encodeURIComponent(repoR)}`, { workflow: 'alpha', brief: 'Add a cache' });
      assert.equal(shared.status, 422);
      const many = said(await shared.json());
      assert.match(many, /^\S+: 3 factories work on this folder — hired on \S+, pair on \S+, solo on \S+ — /);
      saysAll(many, ['?factory=hired', '?factory=pair', '?factory=solo']);
      assert.ok(many.endsWith('Nothing was started.'), many);
      const loose = await post('/api/runs', { workflow: 'beta', brief: 'Add a cache' });
      assert.equal(loose.status, 422);
      const none = said(await loose.json());
      assert.ok(none.startsWith(`${own}: no factory works on this folder, `), none);
      saysAll(none, ['?factory=<name>']);
      assert.deepEqual(runFiles(), before, 'nothing written');
    },
  );

  await t.test(
    'REFUSED: ?factory=default, of a workflow or a card, is a 422 naming ?factory=<name> even with WF_DEFAULT_FACTORY_STARTS=1',
    async (t) => {
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
        const words = said(await res.json());
        assert.ok(words.startsWith('`default` is the default factory: '), words);
        saysAll(words, ['?factory=<name>']);
        assert.ok(words.endsWith('. Nothing was started.'), words);
      }
      assert.ok(
        readInbox().some((c) => c.name === card.name),
        'the card is still there',
      );
      assert.deepEqual(runFiles(), before, 'nothing written');
    },
  );

  await t.test(
    'REFUSED: a card that names no factory is a 422 naming ?factory=, though one factory alone holds its repository; it stays',
    async (t) => {
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
    },
  );
});

test('a person reads the factories: the default first, each by name, a broken file with why, the trust each wants, and a template', async (t) => {
  const s = story(t);

  await s.test(
    'GET /api/factories serves the default factory first, then each factory by name, and one whose file does not read with why, hiding no other',
    async () => {
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
    },
  );

  await s.test(
    "a templated factory's template: not applied before the daemon renders it, then the version and conditions it wrote",
    async () => {
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
    },
  );

  await s.test(
    "a templated factory's workflows are its tree's, before its repository's: listed, paged and started from the tree",
    async () => {
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
    },
  );
});

test('a person schedules a workflow in a factory: listed with its next fire and last run, a cron refused, and taken back', async (t) => {
  const s = story(t);
  const route = '/api/factories/solo/schedules/alpha';
  const json = { 'content-type': 'application/json' };
  const schedulesOf = async (name: string) => (await get<FactoryAnswer[]>('/api/factories')).body.find((f) => f.name === name)?.schedules;

  await s.test(
    "GET /api/factories answers a factory's schedules with their next fire and last scheduled run, as the package lists them, and the line that takes each back",
    async (sub: TestContext) => {
      sub.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-08T12:00:00Z') });
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
        sub.mock.timers.reset();
      }
    },
  );

  await s.test("REFUSED: a PUT with a cron Effect's Cron does not read is a 422 naming the cron, and nothing is scheduled", async () => {
    const res = await app.request(route, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ cron: 'not a cron', brief: 'Read the stats' }),
    });
    assert.equal(res.status, 422);
    assert.match(said(await res.json()), /not a cron/);
    assert.deepEqual(await schedulesOf('solo'), []);
  });

  await s.test('REFUSED: a cron that is no string is a 400 naming the route, the key and what was sent', async () => {
    const wrong = await app.request(route, { method: 'PUT', headers: json, body: JSON.stringify({ cron: 9, brief: 'Read the stats' }) });
    assert.equal(wrong.status, 400);
    assert.match(said(await wrong.json()), /^PUT \/api\/factories\/solo\/schedules\/alpha: `cron` .* This request's was 9\.$/);
  });

  await s.test("a schedule PUT on the factory's route is listed on GET /api/factories and taken back by its DELETE", async () => {
    const put = await app.request(route, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ cron: '0 9 * * 1', brief: 'Read the stats' }),
    });
    assert.equal(put.status, 200, said(await put.clone().json()));
    assert.deepEqual(
      (await schedulesOf('solo'))?.map((s) => [s.workflow, s.cron, s.brief, s.commands.unschedule]),
      [['alpha', '0 9 * * 1', 'Read the stats', 'nemia factory unschedule solo alpha']],
    );
    const del = await app.request(route, { method: 'DELETE', headers: json, body: '{}' });
    assert.equal(del.status, 200);
    assert.deepEqual(await schedulesOf('solo'), []);
  });
});
