/**
 * A factory's Proposals and Delegations served (src/proposals/), and who calls (src/caller/caller.ts): a forged bearer, or a header that is
 * not one, refused 401 on any route; a live session's token naming its agent, run and step in the proposal it files; the person's approval
 * applying the proposal into the factory's tree; a delegation written by the person and refused an agent's session (403). The guard before
 * every write is `test/guarded.test.ts`'s. Kinds, statuses and reasons are asserted, never a sentence.
 *
 * On the stand-ins: the runtime's test engine, the session's task filed on it and left working, and the test place; the factory `pmill`
 * made from a template, its tree written by hand, and the run its session's token names planted as a record (`pr-run`, its one step
 * `design` running as the engine's task `TASK`).
 */
import { root } from '../../test/harness.ts';
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import type { Delegation, Proposal } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

const FACTORY = 'pmill';
const RUN = 'pr-run';
const TASK = 't-pr-design';
const STEP = '---\nplace: folder\nbudget: 5\n---\nPlan the change.\n';

/**
 * The workflow `fenced` and the agents it runs, by file (an agent's under the tree's `workflows/agents/`): `design` names `writer`,
 * whose own denies its step adds one to, and `review` is filled by the factory's hire of `reader`, its own deny beside the agent's. Served,
 * each step's spec carries what its file writes alone, and its status the agent's denies with its own and `review` its hired agent.
 */
const FENCED: Readonly<Record<string, string>> = {
  'workflows/agents/writer.md':
    '---\nrole: Writer\ndescription: Writes the change.\nclaude:\n  fence:\n    permissionMode: auto\n    disallowedTools: Bash(git push:*), Bash(gh:*)\n---\nWrite it.\n',
  'workflows/agents/reader.md':
    '---\nrole: Reader\ndescription: Reads the change.\nclaude:\n  fence:\n    disallowedTools: Bash(git push:*), Bash(git commit:*)\n---\nRead it.\n',
  'README.md': '# fenced\n\nWrite, then read.\n',
  'design.md': '---\nplace: folder\nagent: writer\nbudget: 5\nclaude:\n  fence:\n    disallowedTools: Bash(rm:*)\n---\nDesign it.\n',
  'review.md': '---\nafter: design\nplace: folder\nbudget: 3\nclaude:\n  fence:\n    disallowedTools: Bash(curl:*)\n---\nReview it.\n',
};

/** `dev`'s README: a frontmatter with a comment and a need, then the instruction. */
const DEV_README = '---\n# what a run of it needs\nneeds:\n  - name: shell\n    message: a shell\n    check: "true"\n---\n# dev\n\nPlan.\n';

/** The factory `pmill`, made from a template: its tree one workflow `dev` with a step `plan`, attached. */
const TREE = (() => {
  const repo = path.join(root, 'pr-repo');
  fs.mkdirSync(repo, { recursive: true });
  const factories = path.join(root, 'factories');
  fs.mkdirSync(factories, { recursive: true });
  fs.writeFileSync(
    path.join(factories, `${FACTORY}.json`),
    JSON.stringify({ volumes: [{ path: repo, readOnly: false }], template: { source: '/t/team', version: '0.1.0', params: {} } }),
  );
  const tree = path.join(factories, FACTORY, 'tree');
  fs.mkdirSync(path.join(tree, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev', 'fenced'], hires: { 'fenced/review': 'reader' } }));
  fs.writeFileSync(path.join(tree, 'workflows', 'dev', 'README.md'), DEV_README);
  fs.writeFileSync(path.join(tree, 'workflows', 'dev', 'plan.md'), STEP);
  const fenced = path.join(tree, 'workflows', 'fenced');
  const agents = path.join(tree, 'workflows', 'agents');
  fs.mkdirSync(fenced, { recursive: true });
  fs.mkdirSync(agents, { recursive: true });
  for (const [file, text] of Object.entries(FENCED)) fs.writeFileSync(path.join(file.includes('/') ? tree : fenced, file), text);
  return tree;
})();

fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'runs', `${RUN}.json`),
  JSON.stringify({
    id: RUN,
    repo: path.join(root, 'pr-repo'),
    workspace: path.join(root, 'pr-repo'),
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Plan it',
    workflowDir: path.join(TREE, 'workflows', 'dev'),
    createdAt: '2026-11-05T06:00:00.000Z',
    workflow: [{ name: 'design', after: [], body: 'Design it.' }],
    steps: { design: { taskId: TASK } },
    factory: FACTORY,
  }),
);

/** A session's token for the step `design` of the run, its try the live one while `TASK` is filed and unsettled. */
const token = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).tokens.mint({
      agent: 'implementer',
      factory: FACTORY,
      run: RUN,
      step: 'design',
      attempt: 1,
      task: TASK,
    });
  }).pipe(Effect.provide(tokenDoorFiles(root))),
);

/** The session's task filed on the stand-in and left working: its token is live. */
const sessionRunning = () => {
  Effect.runSync(engine().file({ id: TASK, brief: 'Design it.', cwd: path.join(root, 'pr-repo'), harness: 'claude' }));
  standIn().settle(TASK, 'working');
};

/** What the board sends: JSON, same-origin. */
const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

const ns = `/api/namespaces/${FACTORY}`;

/** A request of the app, as the board makes it, a session's where `bearer` is given. */
const ask = (url: string, method: string, body?: unknown, bearer?: string) =>
  app().request(url, {
    method,
    headers: { ...BOARD, ...(bearer !== undefined && { authorization: `Bearer ${bearer}` }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

/** The `dev` workflow as the namespace serves it, its plan step's body replaced by `body`, at the version it was read. */
async function devChanged(body: string) {
  const res = await app().request(`${ns}/workflows/dev`);
  assert.equal(res.status, 200, 'the workflow reads');
  const now = (await res.json()) as {
    metadata: { resourceVersion?: string };
    spec: { readme?: string | null; steps: { name: string; keys: Record<string, unknown>; body: string }[] };
  };
  return {
    kind: 'Workflow',
    metadata: { name: 'dev', resourceVersion: now.metadata.resourceVersion },
    spec: { ...now.spec, steps: now.spec.steps.map((s) => (s.name === 'plan' ? { ...s, body } : s)) },
  };
}

/** A step of a Workflow as the namespace serves it: its name, the keys it sets, and its note. */
type ServedStep = { name: string; keys: Record<string, unknown>; body: string };

/**
 * The `fenced` workflow as the namespace serves it (`nemia get workflow fenced -o json`), each step changed by `change`, at the version
 * it was read.
 */
async function fencedChanged(change: (step: ServedStep) => ServedStep) {
  const res = await app().request(`${ns}/workflows/fenced`);
  assert.equal(res.status, 200, 'the workflow reads');
  const now = (await res.json()) as { metadata: { resourceVersion?: string }; spec: { steps: ServedStep[] } };
  return {
    kind: 'Workflow',
    metadata: { name: 'fenced', resourceVersion: now.metadata.resourceVersion },
    spec: { ...now.spec, steps: now.spec.steps.map(change) },
  };
}

const planText = () => fs.readFileSync(path.join(TREE, 'workflows', 'dev', 'plan.md'), 'utf8');

test('REFUSED: a forged bearer, and an Authorization that is no bearer, are 401 on any route, before it answers', async () => {
  for (const url of ['/api/health', `${ns}/proposals`, '/api/runs']) {
    const forged = await app().request(url, { headers: { authorization: 'Bearer not-a-minted-token' } });
    assert.equal(forged.status, 401, `${url}: a forged token`);
    assert.equal(((await forged.json()) as { reason?: string }).reason, 'unknown-token');
    const shaped = await app().request(url, { headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    assert.equal(shaped.status, 401, `${url}: no bearer`);
  }
  assert.equal((await app().request('/api/health')).status, 200, "the person's token, the test seat's, passes");
});

test('REFUSED: a token whose session no longer runs is 401 session-ended', async () => {
  sessionRunning();
  standIn().settle(TASK, 'succeeded', { exitCode: 0, closeout: { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] } });
  const res = await ask(`${ns}/proposals`, 'GET', undefined, token);
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { reason?: string }).reason, 'session-ended');
});

describe('a proposal filed by a live session names its agent, run and step; the person approves it and it is applied into the tree', () => {
  let was!: string;
  let created!: Response;
  let proposal!: Proposal;
  beforeAll(async () => {
    sessionRunning();
    was = planText();
    created = await ask(`${ns}/proposals`, 'POST', { objects: [await devChanged('Plan it twice.\n')] }, token);
    assert.equal(created.status, 201);
    proposal = (await created.json()) as Proposal;
  });
  test('filed waiting, proposed by the session, nothing written yet', () => {
    assert.equal(proposal.kind, 'Proposal');
    assert.equal(proposal.status.phase, 'waiting');
    assert.deepEqual(proposal.status.proposedBy, { agent: 'implementer', run: RUN, step: 'design' });
    assert.equal(planText(), was);
  });
  test('listed and read in its namespace', async () => {
    const list = (await (await app().request(`${ns}/proposals`)).json()) as { kind: string; items: Proposal[] };
    assert.equal(list.kind, 'ProposalList');
    assert.deepEqual(
      list.items.map((p) => p.metadata.name),
      [proposal.metadata.name],
    );
    const waiting = (await (await app().request(`${ns}/proposals?fieldSelector=status.phase%3Dwaiting`)).json()) as { items: Proposal[] };
    assert.deepEqual(
      waiting.items.map((p) => p.metadata.name),
      [proposal.metadata.name],
    );
    assert.equal((await app().request(`${ns}/proposals/${proposal.metadata.name}`)).status, 200);
    assert.equal((await app().request(`${ns}/proposals/nothing-here`)).status, 404);
  });
  test('REFUSED: the session declining it, which is the person alone, is 403 person-only', async () => {
    const res = await ask(`${ns}/proposals/${proposal.metadata.name}/decline`, 'POST', {}, token);
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { reason?: string }).reason, 'person-only');
  });
  test("the person's approval answers 200 applied, and the tree holds the change", async () => {
    const res = await ask(`${ns}/proposals/${proposal.metadata.name}/approve`, 'POST', {});
    assert.equal(res.status, 200);
    const applied = (await res.json()) as Proposal;
    assert.equal(applied.status.phase, 'applied', applied.status.message);
    assert.equal(applied.status.approvedBy?.by, 'person');
    assert.match(planText(), /Plan it twice\./);
  });
  test('a proposal of the person is proposed by no one, and declined by them', async () => {
    const res = await ask(`${ns}/proposals`, 'POST', { objects: [await devChanged('Again.\n')] });
    assert.equal(res.status, 201);
    const mine = (await res.json()) as Proposal;
    assert.deepEqual(mine.status.proposedBy, {});
    const declined = await ask(`${ns}/proposals/${mine.metadata.name}/decline`, 'POST', {});
    assert.equal(declined.status, 200);
    assert.equal(((await declined.json()) as Proposal).status.phase, 'declined');
  });
  test('listed by phase: ?fieldSelector=status.phase keeps the proposals in it, or in every other by !=', async () => {
    const phases = async (selector: string) => {
      const res = await app().request(`${ns}/proposals?fieldSelector=${encodeURIComponent(selector)}`);
      assert.equal(res.status, 200, selector);
      return ((await res.json()) as { items: Proposal[] }).items.map((p) => p.status.phase);
    };
    assert.deepEqual(await phases('status.phase=waiting'), []);
    assert.deepEqual(await phases('status.phase==applied'), ['applied']);
    assert.deepEqual(await phases('status.phase!=applied'), ['declined']);
    assert.deepEqual((await phases('')).sort(), ['applied', 'declined']);
  });
  test('REFUSED: a fieldSelector that names no phase, or another field, is 422', async () => {
    for (const selector of ['status.phase=pending', 'status.state=waiting'])
      assert.equal((await app().request(`${ns}/proposals?fieldSelector=${encodeURIComponent(selector)}`)).status, 422, selector);
  });
});

describe("a Workflow proposed as the namespace serves it reports the access of its fence keys alone, its agents' denies and hire never read as a change", () => {
  const accessOf = async (change: (step: ServedStep) => ServedStep) => {
    const res = await ask(`${ns}/proposals`, 'POST', { objects: [await fencedChanged(change)] });
    assert.equal(res.status, 201);
    const proposal = (await res.json()) as Proposal;
    return { access: proposal.status.changes.map((c) => c.access), widens: proposal.status.widens };
  };
  test('as served, unchanged: same', async () => {
    assert.deepEqual(await accessOf((s) => s), { access: ['same'], widens: false });
  });
  test("a step's body changed: same", async () => {
    assert.deepEqual(await accessOf((s) => (s.name === 'review' ? { ...s, body: 'Review it twice.\n' } : s)), {
      access: ['same'],
      widens: false,
    });
  });
  test("a step's allow added: widens", async () => {
    const added = (s: ServedStep) => (s.name === 'design' ? { ...s, keys: { ...s.keys, allowedTools: ['Bash(npm test)'] } } : s);
    assert.deepEqual(await accessOf(added), { access: ['widens'], widens: true });
  });
});

/** Every file of the workflow `name`'s folder in the tree, by name, with its bytes. */
const folderBytes = (name: string) => {
  const dir = path.join(TREE, 'workflows', name);
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .sort()
      .map((file) => [file, fs.readFileSync(path.join(dir, file)).toString('base64')]),
  );
};

/** The Workflow `name` as the namespace serves it. */
const served = async (name: string) => {
  const res = await app().request(`${ns}/workflows/${name}`);
  assert.equal(res.status, 200, 'the workflow reads');
  return (await res.json()) as import('objects').Workflow;
};

describe('a Workflow is served as its files hold it, what the store works out under status', () => {
  test("fenced's spec is its files': each step's own keys, in file-name order, no agent's denies nor hire", async () => {
    const fenced = await served('fenced');
    assert.deepEqual(
      fenced.spec.steps.map((s) => s.name),
      ['design', 'review'],
    );
    const keys = Object.fromEntries(fenced.spec.steps.map((s) => [s.name, s.keys as Record<string, unknown>]));
    assert.deepEqual(keys.design?.disallowedTools, ['Bash(rm:*)'], 'the design step its own deny alone');
    assert.equal('agent' in (keys.review ?? {}), false, 'the review step without the agent hired into it');
    const status = Object.fromEntries(fenced.status.steps.map((s) => [s.name, s]));
    assert.equal(status.review?.hired, 'reader', 'the hire is read under status');
    assert.deepEqual(
      status.design?.spec.disallowedTools,
      ['Bash(rm:*)', 'Bash(git push:*)', 'Bash(gh:*)'],
      "the agent's denies after the step's own are read under status",
    );
  });
  test("dev's README whole in spec, its description, needs and instruction under status, and no needs nor description in spec", async () => {
    const dev = await served('dev');
    assert.equal(dev.spec.readme, DEV_README);
    assert.equal('needs' in dev.spec || 'description' in dev.spec, false);
    assert.deepEqual(dev.status.needs, [{ name: 'shell', message: 'a shell', check: 'true' }]);
    assert.equal(dev.status.readmeBody, '# dev\n\nPlan.\n');
    assert.equal(dev.status.description, 'Plan.');
  });
});

describe('a Workflow proposed exactly as it reads changes nothing: every change same, applied, its files byte for byte and its version kept', () => {
  for (const name of ['dev', 'fenced']) {
    test(name, async () => {
      const before = await served(name);
      const bytes = folderBytes(name);
      const object = {
        kind: 'Workflow',
        metadata: { name, resourceVersion: before.metadata.resourceVersion },
        spec: before.spec,
      };
      const res = await ask(`${ns}/proposals`, 'POST', { objects: [object] });
      assert.equal(res.status, 201, await res.clone().text());
      const proposal = (await res.json()) as Proposal;
      assert.deepEqual(
        proposal.status.changes.map((c) => c.access),
        ['same'],
      );
      const approved = await ask(`${ns}/proposals/${proposal.metadata.name}/approve`, 'POST', {});
      assert.equal(approved.status, 200, await approved.clone().text());
      assert.equal(((await approved.json()) as Proposal).status.phase, 'applied');
      assert.deepEqual(folderBytes(name), bytes, 'every file of the folder as it was');
      const after = await served(name);
      assert.equal(after.metadata.resourceVersion, before.metadata.resourceVersion, 'the version as it was');
      assert.deepEqual(after.spec, before.spec);
    });
  }
});

test('REFUSED stale: a Workflow proposed at a version read before its files moved is 409, naming the read that serves its files', async () => {
  const read = await served('dev');
  const plan = path.join(TREE, 'workflows', 'dev', 'plan.md');
  const was = fs.readFileSync(plan, 'utf8');
  fs.writeFileSync(plan, `${was}Moved.\n`);
  try {
    const object = { kind: 'Workflow', metadata: { name: 'dev', resourceVersion: read.metadata.resourceVersion }, spec: read.spec };
    const res = await ask(`${ns}/proposals`, 'POST', { objects: [object] });
    assert.equal(res.status, 409);
    assert.ok(((await res.json()) as { error: string }).error.includes('nemia get workflows dev'), 'the fix names the read');
  } finally {
    fs.writeFileSync(plan, was);
  }
});

test("a delegation is the person's: written, read, listed and removed by them, and refused a live session's token 403", async () => {
  sessionRunning();
  const spec = { rules: [{ resources: ['workflows'], resourceNames: [], verbs: ['update'] }] };
  const refused = await ask(`${ns}/delegations/implementer`, 'PUT', spec, token);
  assert.equal(refused.status, 403);
  assert.equal(((await refused.json()) as { reason?: string }).reason, 'person-only');
  assert.equal((await app().request(`${ns}/delegations/implementer`)).status, 404, 'nothing was written');
  const put = await ask(`${ns}/delegations/implementer`, 'PUT', spec);
  assert.equal(put.status, 200);
  assert.equal(((await put.json()) as Delegation).metadata.name, 'implementer');
  const list = (await (await app().request(`${ns}/delegations`)).json()) as { kind: string; items: Delegation[] };
  assert.equal(list.kind, 'DelegationList');
  assert.deepEqual(
    list.items.map((d) => d.metadata.name),
    ['implementer'],
  );
  const removedByToken = await ask(`${ns}/delegations/implementer`, 'DELETE', {}, token);
  assert.equal(removedByToken.status, 403, "a session's removal is refused");
  const removed = await ask(`${ns}/delegations/implementer`, 'DELETE', {});
  assert.equal(removed.status, 200);
  assert.equal(((await removed.json()) as Delegation).metadata.name, 'implementer', 'the removal answers what it removed');
  assert.equal((await ask(`${ns}/delegations/implementer`, 'DELETE', {})).status, 404, 'none is there to remove');
});
