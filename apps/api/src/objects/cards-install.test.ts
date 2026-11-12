/**
 * The Card's create, label and queue (`POST /api/namespaces/:namespace/cards…`, objects/cards.ts) on an api that runs a release, with no
 * repository of its own (`Running` of `kind: 'install'`, `HKB_REPO` unset): a card is placed by what it says, never refused for the api's
 * missing repository. One in a factory of one repository is filed there and listed, labelled and queued; one that names no factory and no
 * repository is filed with none, as `nemia inbox add` in process files it. A card naming a workflow has it looked for on the `repo:` it
 * names where that is one the api serves, and only one naming a workflow and no place to find it on asks for the repository the api does
 * not have.
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
import { addFactory } from 'agent-orchestrator/testing';
import type { Card, CardList } from 'objects';
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

  await s.test("a card in no factory whose repo: is one of a factory's has its workflow found there, by name", async () => {
    const res = await send('/api/namespaces/default/cards', 'POST', { body: 'On the mill.', repo: millRepo, workflow: 'dev' });
    const card = (await res.json()) as Card;
    assert.equal(res.status, 201, JSON.stringify(card));
    assert.equal(card.spec.repo, millRepo);
    assert.equal(card.spec.workflow, 'dev');
  });

  await s.test('REFUSED: a card naming a workflow and no place to find it on is 422, nothing filed', async () => {
    const before = fs.readdirSync(path.join(root, 'inbox')).length;
    const res = await send('/api/namespaces/default/cards', 'POST', { body: 'Somewhere.', workflow: 'dev' });
    assert.equal(res.status, 422);
    assert.equal(fs.readdirSync(path.join(root, 'inbox')).length, before);
  });
});
