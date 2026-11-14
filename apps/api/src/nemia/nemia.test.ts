/**
 * The nemia group's endpoints that serve what was the command line's alone, each calling its entry of the package's table by type: an
 * agent's proposal written (`PUT /api/policy/:name/proposal`, `nemia policy propose`), what its rules reach in a factory
 * (`GET /api/policy/:name/reach`, `nemia policy reach`); and what each refuses as the command line refuses it, writing nothing. The
 * names an agent once spoke under in her chat (`/api/nemia/chat/speakers`) are retired, an agent speaking with a token of its own: no
 * route answers them.
 *
 * The store is the harness's scratch one (`root`, test/harness.ts); the agent's custom instruction is written where the package keeps it
 * (`customInstructionsFile`), and its factory planted with the package's test spelling (`addFactory`, `attachWorkflow`).
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { customInstructionsFile } from 'agent-orchestrator';
import { addFactory, attachWorkflow } from 'agent-orchestrator/testing';
import type { PolicyReach } from 'objects';
import type { PolicyAnswer } from './nemia.ts';
import { app } from '../app.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** The api's answer to `method` on `url` with `body`, as the board sends it. */
async function asked(method: string, url: string, body?: unknown) {
  const res = await app.request(url, { method, headers: BOARD, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: (await res.json()) as unknown };
}

/** The error's text of a refusal's body. */
const errorOf = (body: unknown): string => String((body as { error?: unknown }).error);

/** What the agent `drafter` proposed, as the store keeps it. */
const PROPOSED = path.join(root, 'auto', 'drafter.proposed.json');

/** The names once allowed to speak in her chat, as the store kept them. */
const SPEAKERS = path.join(root, 'nemia', 'chat', 'speakers.json');

/** A proposal of one rule, as an agent writes it. */
const PROPOSAL = { rules: [{ id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'] }], guidance: ['be kind'] };

test('PUT /api/policy/:name/proposal writes what the agent proposes from its custom instruction, and answers its rules, none in force', async () => {
  const file = customInstructionsFile(root, 'drafter');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'Retry implement once its check passed.\n');
  const res = await asked('PUT', '/api/policy/drafter/proposal', { words: JSON.stringify(PROPOSAL) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const list = res.body as PolicyAnswer;
  assert.equal(list.agent, 'drafter');
  assert.deepEqual(
    list.proposed?.rules.map((r) => [r.id, r.confirmed]),
    [['tries', false]],
    'proposed, not in force',
  );
  assert.deepEqual(list.proposed?.guidance, ['be kind']);
  assert.equal(list.isDefault, true, 'the default stays in force: a proposal confirms nothing');
  assert.equal(list.instruction, 'Retry implement once its check passed.', 'read beside the custom instruction it was proposed from');
  assert.equal(list.proposed?.stale, false, 'proposed from the custom instruction as it reads now');
  const kept = JSON.parse(fs.readFileSync(PROPOSED, 'utf8')) as { rules: { id: string }[] };
  assert.deepEqual(
    kept.rules.map((r) => r.id),
    ['tries'],
    'the proposal is written to the store',
  );
});

test('REFUSED (422), writing nothing: words that are no proposal, and a name that is no agent', async () => {
  const before = fs.readFileSync(PROPOSED, 'utf8');
  const notJson = await asked('PUT', '/api/policy/drafter/proposal', { words: 'rules: none' });
  assert.equal(notJson.status, 422);
  assert.match(errorOf(notJson.body), /not JSON/);
  const twice = await asked('PUT', '/api/policy/drafter/proposal', {
    words: JSON.stringify({ rules: [PROPOSAL.rules[0], PROPOSAL.rules[0]] }),
  });
  assert.equal(twice.status, 422);
  assert.equal(fs.readFileSync(PROPOSED, 'utf8'), before, 'what was proposed is unchanged');
  const hidden = await asked('PUT', '/api/policy/.drafter/proposal', { words: JSON.stringify(PROPOSAL) });
  assert.equal(hidden.status, 422);
  assert.equal(fs.existsSync(path.join(root, 'auto', '.drafter.proposed.json')), false);
  const wordless = await asked('PUT', '/api/policy/drafter/proposal', {});
  assert.equal(wordless.status, 400);
  assert.equal((wordless.body as { field?: string }).field, 'payload.words');
});

test("GET /api/policy/:name/reach reads the steps at their gate in a factory's workflows, and why no rule in force reaches one", async () => {
  const repo = scratch('nemia-api-reach-');
  fs.mkdirSync(path.join(repo, 'workflows', 'plain'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'workflows', 'agents'));
  fs.writeFileSync(
    path.join(repo, 'workflows', 'agents', 'writer.md'),
    '---\nrole: Writer\ndescription: Drafts.\nharness: claude\n---\nDraft.\n',
  );
  fs.writeFileSync(path.join(repo, 'workflows', 'plain', 'draft.md'), '---\nplace: git\nagent: writer\ngate: true\n---\nDraft it.\n');
  addFactory({ name: 'reachmill', repos: [repo] });
  attachWorkflow({ factory: 'reachmill', workflow: 'plain' });
  const res = await asked('GET', '/api/policy/drafter/reach?factory=reachmill');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const reach = res.body as PolicyReach;
  assert.deepEqual([reach.agent, reach.factory, reach.run], ['drafter', 'reachmill', null]);
  assert.deepEqual(reach.unloaded, [], 'the workflow loads');
  assert.equal(reach.reach, 'none', 'the default needs a check passed, and draft has none');
  assert.deepEqual(
    reach.gates.map((g) => [g.workflow, g.step, g.misses.map((m) => (m.why === 'never-holds' ? [m.why, m.condition] : [m.why]))]),
    [['plain', 'draft', [['never-holds', 'checked']]]],
  );
  assert.ok(
    reach.proposal.rules.some((r) => r.id === 'tries'),
    'the proposal to propose by keeps what the agent proposed already',
  );
});

test('REFUSED: a reach of neither a factory nor a run, or of both (422), and of a factory that is not there (404)', async () => {
  const neither = await asked('GET', '/api/policy/drafter/reach');
  assert.equal(neither.status, 422);
  assert.match(errorOf(neither.body), /one factory or one run/);
  const both = await asked('GET', '/api/policy/drafter/reach?factory=reachmill&run=r1');
  assert.equal(both.status, 422);
  const ghost = await asked('GET', '/api/policy/drafter/reach?factory=ghostmill');
  assert.equal(ghost.status, 404, JSON.stringify(ghost.body));
});

test('REFUSED: the retired speakers of her chat are no route — listed, allowed or taken back, each a 404 that writes nothing', async () => {
  for (const [method, url] of [
    ['GET', '/api/nemia/chat/speakers'],
    ['PUT', '/api/nemia/chat/speakers/operator'],
    ['DELETE', '/api/nemia/chat/speakers/operator'],
  ] as const) {
    const res = await app.request(url, { method, headers: BOARD, ...(method === 'PUT' ? { body: '{}' } : {}) });
    assert.equal(res.status, 404, `${method} ${url}`);
  }
  assert.equal(fs.existsSync(SPEAKERS), false, 'no list is written');
});
