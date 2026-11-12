/**
 * The Card's create, label and queue (`POST /api/namespaces/:namespace/cards…`, objects/cards.ts) on an api that runs a release, with no
 * repository of its own (`Running` of `kind: 'install'`, `HKB_REPO` unset): a card is placed by what it says, never refused for the api's
 * missing repository. A card names its factory and its workflow, never a repository: one in a factory of one repository is filed there
 * and listed, labelled and queued; one that names no factory is filed with none, as `nemia inbox add` in process files it, its workflow
 * by name with no repository looked at. A `repo` sent is refused, and so is a `?repo=` on a card's start: the factory places the run, by
 * the repository its wiring names (`PUT …/workflows/<workflow>` with `{ repo }`), which an attach sent with no body leaves as it was.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import type { Running } from 'agent-orchestrator';
import { addFactory, attachWorkflow } from 'agent-orchestrator/testing';
import type { Card, CardList, Factory } from 'objects';
import { appOf, liveOf } from '../app.ts';
import { ApiConfig } from '../layer.ts';

const running: Running = {
  kind: 'install',
  root: scratch('nemia-api-cards-install-release-'),
  tag: 'v1.0.0',
  commit: 'abc',
  source: 'https://example.invalid/releases',
  builtAt: '2026-11-12T00:00:00.000Z',
  from: 'archive',
};
const { HKB_REPO: _noRepoOfItsOwn, WF_EXPOSED: _notExposed, ...env } = process.env;
const { app } = appOf(Layer.merge(liveOf(env), ApiConfig.layer(env, running)));

/** The one repository of the factory `mill`, with a workflow `dev` a card in it names. */
const millRepo = scratch('nemia-api-cards-install-repo-');
fs.mkdirSync(path.join(millRepo, 'workflows', 'dev'), { recursive: true });
fs.writeFileSync(path.join(millRepo, 'workflows', 'dev', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
addFactory({ name: 'mill', repos: [millRepo] });
attachWorkflow({ factory: 'mill', workflow: 'dev' });

const JSON_TYPE = { 'content-type': 'application/json' };
const send = (url: string, method: string, body: unknown) => app.request(url, { method, headers: JSON_TYPE, body: JSON.stringify(body) });

test('on an install, a card is placed by its factory, or filed with no repository, never refused for the api having none', async (t) => {
  const s = story(t);

  await s.test('a card saying factory: mill, of one repository, is filed in mill and listed there', async () => {
    const res = await send('/api/namespaces/mill/cards', 'POST', { body: 'Cache the views.', factory: 'mill', workflow: 'dev' });
    const card = (await res.json()) as Card;
    assert.equal(res.status, 201, JSON.stringify(card));
    assert.equal(card.metadata.namespace, 'mill');
    assert.equal(card.spec.workflow, 'dev', "its workflow is found by name on the factory's repository");
    const listed = (await (await app.request('/api/namespaces/mill/cards')).json()) as CardList;
    assert.deepEqual(
      listed.items.map((c) => c.metadata.name),
      [card.metadata.name],
    );
  });

  const [filed] = fs.readdirSync(path.join(root, 'inbox'));
  assert.ok(filed);
  const name = filed.replace(/\.md$/, '');

  await s.test('the card in mill is labelled and queued on the install', async () => {
    const labelled = await send(`/api/namespaces/mill/cards/${name}/labels`, 'POST', { labels: ['team=core'] });
    assert.equal(labelled.status, 200, await labelled.clone().text());
    const queued = await send(`/api/namespaces/mill/cards/${name}/queue`, 'POST', {});
    const card = (await queued.json()) as Card;
    assert.equal(queued.status, 200, JSON.stringify(card));
    assert.ok(card.spec.queued, 'the card is queued');
  });

  await s.test('a card that names no factory and no repository is filed with none, in default', async () => {
    const res = await send('/api/namespaces/default/cards', 'POST', { body: 'An idea for later.' });
    const card = (await res.json()) as Card;
    assert.equal(res.status, 201, JSON.stringify(card));
    assert.equal(card.metadata.namespace, 'default');
    assert.equal(card.spec.repo, undefined, 'no repository is written that nobody chose');
  });

  await s.test('a card in no factory naming a workflow is filed with it by name, no repository looked at', async () => {
    const res = await send('/api/namespaces/default/cards', 'POST', { body: 'Somewhere.', workflow: 'dev' });
    const card = (await res.json()) as Card;
    assert.equal(res.status, 201, JSON.stringify(card));
    assert.equal(card.spec.workflow, 'dev');
  });

  await s.test('REFUSED: a card sent with a repo is 422, the repo being retired, nothing filed', async () => {
    const before = fs.readdirSync(path.join(root, 'inbox')).length;
    const res = await send('/api/namespaces/default/cards', 'POST', { body: 'On the mill.', repo: millRepo, workflow: 'dev' });
    assert.equal(res.status, 422, await res.clone().text());
    assert.equal(fs.readdirSync(path.join(root, 'inbox')).length, before);
  });

  await s.test("REFUSED: a card's start that names ?repo= is 422, naming the attach, no run started", async () => {
    const res = await send(`/api/namespaces/mill/cards/${name}/start?repo=${encodeURIComponent(millRepo)}`, 'POST', {});
    const answer = await res.text();
    assert.equal(res.status, 422, answer);
    assert.ok(answer.includes('nemia factory attach'), answer);
  });

  await s.test("an attach names the repository a workflow works on by its folder's name, and one sent with no repo keeps it", async () => {
    const wired = await send('/api/factories/mill/workflows/dev', 'PUT', { repo: path.basename(millRepo) });
    assert.equal(wired.status, 200, await wired.clone().text());
    const kept = (await (await send('/api/factories/mill/workflows/dev', 'PUT', {})).json()) as Factory;
    assert.deepEqual(kept.spec.workflowRepos, { dev: path.basename(millRepo) });
    const unknown = await send('/api/factories/mill/workflows/dev', 'PUT', { repo: 'nope' });
    assert.equal(unknown.status, 422, await unknown.clone().text());
  });
});
