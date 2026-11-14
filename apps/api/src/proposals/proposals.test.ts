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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import type { Delegation, Proposal, ProposedObject } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

const FACTORY = 'pmill';
const RUN = 'pr-run';
const TASK = 't-pr-design';
const STEP = '---\nplace: folder\nbudget: 5\n---\nPlan the change.\n';

/** The factory `pmill`, made from a template: its tree one workflow `dev` with a step `plan`, attached. */
const TREE = (() => {
  const repo = path.join(root, 'pr-repo');
  fs.mkdirSync(repo, { recursive: true });
  const factories = path.join(root, 'factories');
  fs.mkdirSync(factories, { recursive: true });
  fs.writeFileSync(
    path.join(factories, `${FACTORY}.json`),
    JSON.stringify({ repos: [repo], template: { source: '/t/team', version: '0.1.0', params: {} } }),
  );
  const tree = path.join(factories, FACTORY, 'tree');
  fs.mkdirSync(path.join(tree, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev'], hires: {} }));
  fs.writeFileSync(path.join(tree, 'workflows', 'dev', 'README.md'), '# dev\n\nPlan.\n');
  fs.writeFileSync(path.join(tree, 'workflows', 'dev', 'plan.md'), STEP);
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
async function devChanged(body: string): Promise<ProposedObject> {
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

test('a proposal filed by a live session names its agent, run and step; the person approves it and it is applied into the tree', async (t) => {
  sessionRunning();
  const was = planText();
  const created = await ask(`${ns}/proposals`, 'POST', { objects: [await devChanged('Plan it twice.\n')] }, token);
  assert.equal(created.status, 201);
  const proposal = (await created.json()) as Proposal;
  await t.test('filed waiting, proposed by the session, nothing written yet', () => {
    assert.equal(proposal.kind, 'Proposal');
    assert.equal(proposal.status.phase, 'waiting');
    assert.deepEqual(proposal.status.proposedBy, { agent: 'implementer', run: RUN, step: 'design' });
    assert.equal(planText(), was);
  });
  await t.test('listed and read in its namespace', async () => {
    const list = (await (await app().request(`${ns}/proposals`)).json()) as { kind: string; items: Proposal[] };
    assert.equal(list.kind, 'ProposalList');
    assert.deepEqual(
      list.items.map((p) => p.metadata.name),
      [proposal.metadata.name],
    );
    assert.equal((await app().request(`${ns}/proposals/${proposal.metadata.name}`)).status, 200);
    assert.equal((await app().request(`${ns}/proposals/nothing-here`)).status, 404);
  });
  await t.test('REFUSED: the session declining it, which is the person alone, is 403 person-only', async () => {
    const res = await ask(`${ns}/proposals/${proposal.metadata.name}/decline`, 'POST', {}, token);
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { reason?: string }).reason, 'person-only');
  });
  await t.test("the person's approval answers 200 applied, and the tree holds the change", async () => {
    const res = await ask(`${ns}/proposals/${proposal.metadata.name}/approve`, 'POST', {});
    assert.equal(res.status, 200);
    const applied = (await res.json()) as Proposal;
    assert.equal(applied.status.phase, 'applied', applied.status.message);
    assert.equal(applied.status.approvedBy?.by, 'person');
    assert.match(planText(), /Plan it twice\./);
  });
  await t.test('a proposal of the person is proposed by no one, and declined by them', async () => {
    const res = await ask(`${ns}/proposals`, 'POST', { objects: [await devChanged('Again.\n')] });
    assert.equal(res.status, 201);
    const mine = (await res.json()) as Proposal;
    assert.deepEqual(mine.status.proposedBy, {});
    const declined = await ask(`${ns}/proposals/${mine.metadata.name}/decline`, 'POST', {});
    assert.equal(declined.status, 200);
    assert.equal(((await declined.json()) as Proposal).status.phase, 'declined');
  });
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
