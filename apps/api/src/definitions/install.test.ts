/**
 * Yours on an install: an api with no repository of its own (`Running` of `kind: 'install'`, `HKB_REPO` unset) and no factory named
 * lists, reads, creates and replaces a workflow, an agent and a skill of yours in `default`, the layers read yours and the builtins; only
 * a request that reads the repository's own layer (`?origin=repo`) asks for a repository, and is refused, naming the fix.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import type { Running } from 'agent-orchestrator';
import type { Agent, Skill, Workflow } from 'objects';
import { appOf, liveOf } from '../app.ts';
import { ApiConfig } from '../layer.ts';
import { StoreRoot } from '../store.ts';

const D = '/api/namespaces/default';
const json = { 'content-type': 'application/json' };

/** An app as an install serves it: unpacked from an archive, its source an address, no repository of its own, over the store `home`. */
function installed(home: string) {
  const running: Running = {
    kind: 'install',
    root: scratch('nemia-api-install-release-'),
    tag: 'v1.0.0',
    commit: 'abc',
    source: 'https://example.invalid/releases',
    builtAt: '2026-11-12T00:00:00.000Z',
    from: 'archive',
  };
  const { HKB_REPO: _noRepoOfItsOwn, ...env } = process.env;
  return appOf(Layer.mergeAll(liveOf(env), ApiConfig.layer(env, running), Layer.succeed(StoreRoot)(home))).app;
}

test('an install with no repository and no factory named: yours is created, read back and replaced, and the repository is asked for only where read', async (t) => {
  const home = scratch('nemia-api-install-home-');
  const app = installed(home);
  const send = (method: 'POST' | 'PUT', url: string, body: unknown) =>
    app.request(url, { method, headers: json, body: JSON.stringify(body) });
  const got = async <T>(url: string): Promise<T> => {
    const res = await app.request(url);
    const body = (await res.json()) as T;
    assert.equal(res.status, 200, `GET ${url}: ${JSON.stringify(body)}`);
    return body;
  };

  await t.test('a workflow of yours', async () => {
    const made = await send('POST', `${D}/workflows`, {
      metadata: { name: 'notes' },
      spec: { steps: [{ name: 'write', keys: { place: 'folder' }, body: 'Write the notes.' }] },
    });
    const created = (await made.json()) as Workflow;
    assert.equal(made.status, 201, JSON.stringify(created));
    assert.equal(created.status.origin, 'yours');
    assert.ok(fs.existsSync(path.join(home, 'workflows', 'notes', 'write.md')), 'written in the store, in yours');
    const read = await got<Workflow>(`${D}/workflows/notes`);
    assert.equal(read.metadata.resourceVersion, created.metadata.resourceVersion, 'read back as written');
    const put = await send('PUT', `${D}/workflows/notes`, {
      metadata: { resourceVersion: read.metadata.resourceVersion },
      spec: { steps: [{ name: 'write', keys: { place: 'folder' }, body: 'Write the notes again.' }] },
    });
    const replaced = (await put.json()) as Workflow;
    assert.equal(put.status, 200, JSON.stringify(replaced));
    assert.equal(replaced.spec.steps[0]?.body.trim(), 'Write the notes again.');
    const list = await got<{ items: Workflow[] }>(`${D}/workflows`);
    assert.deepEqual(
      list.items.map((w) => [w.metadata.name, w.status.origin]),
      [['notes', 'yours']],
    );
  });

  await t.test('an agent of yours', async () => {
    const spec = { description: 'Use this when notes are due.', keys: {}, instructions: 'Write it.' };
    const made = await send('POST', `${D}/agents`, { metadata: { name: 'scribe' }, spec });
    const created = (await made.json()) as Agent;
    assert.equal(made.status, 201, JSON.stringify(created));
    assert.equal(created.status.origin, 'yours');
    const read = await got<Agent>(`${D}/agents/scribe`);
    const put = await send('PUT', `${D}/agents/scribe`, {
      metadata: { resourceVersion: read.metadata.resourceVersion },
      spec: { ...spec, instructions: 'Write it again.' },
    });
    const replaced = (await put.json()) as Agent;
    assert.equal(put.status, 200, JSON.stringify(replaced));
    assert.equal(replaced.spec.instructions?.trim(), 'Write it again.');
    const cwd = scratch('nemia-api-install-cwd-');
    fs.mkdirSync(path.join(cwd, 'workflows', 'agents'), { recursive: true });
    fs.copyFileSync(path.join(home, 'workflows', 'agents', 'scribe.md'), path.join(cwd, 'workflows', 'agents', 'stray.md'));
    const was = process.cwd();
    process.chdir(cwd);
    let list: { items: Agent[] };
    try {
      list = await got<{ items: Agent[] }>(`${D}/agents`);
    } finally {
      process.chdir(was);
    }
    assert.deepEqual(
      list.items.map((a) => [a.metadata.name, a.status.origin]),
      [['scribe', 'yours']],
      'yours alone: no repository is read, nor an agent of the folder the api runs in (stray)',
    );
    const carder = await send('POST', `${D}/agents`, {
      metadata: { name: 'carder' },
      spec: { description: 'Use this when cards are due.', keys: {}, skills: 'stray-skill', instructions: 'Card it.' },
    });
    assert.equal(carder.status, 201, await carder.text());
    fs.mkdirSync(path.join(cwd, '.claude', 'skills', 'stray-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.claude', 'skills', 'stray-skill', 'SKILL.md'),
      '---\nname: stray-skill\ndescription: Found only in the folder the api runs in.\n---\nStray.\n',
    );
    process.chdir(cwd);
    let card: Response;
    let listed: Agent;
    try {
      card = await app.request(`${D}/agents/carder/card`);
      listed = await got<Agent>(`${D}/agents/carder`);
    } finally {
      process.chdir(was);
    }
    const answer = await card.text();
    assert.ok(!answer.includes('stray-skill') || card.status !== 200, `the card finds no skill in the folder the api runs in: ${answer}`);
    assert.equal(listed.status.card, null, `nor does the agent's own card: ${JSON.stringify(listed.status.cardError)}`);
  });

  await t.test('a skill of yours, beside the builtins', async () => {
    const spec = { description: 'Keeps notes short.', body: 'One fact a line.' };
    const made = await send('POST', `${D}/skills`, { metadata: { name: 'short-notes' }, spec });
    const created = (await made.json()) as Skill;
    assert.equal(made.status, 201, JSON.stringify(created));
    assert.equal(created.status.origin, 'yours');
    const read = await got<Skill>(`${D}/skills/short-notes`);
    const put = await send('PUT', `${D}/skills/short-notes`, {
      metadata: { resourceVersion: read.metadata.resourceVersion },
      spec: { ...spec, body: 'One fact a line, no more.' },
    });
    const replaced = (await put.json()) as Skill;
    assert.equal(put.status, 200, JSON.stringify(replaced));
    assert.equal(replaced.spec.body.trim(), 'One fact a line, no more.');
    const list = await got<{ items: Skill[] }>(`${D}/skills`);
    const origins = new Set(list.items.map((s) => s.status.origin));
    assert.ok(list.items.some((s) => s.metadata.name === 'short-notes' && s.status.origin === 'yours'));
    assert.deepEqual([...origins].sort(), ['builtin', 'yours'], 'yours and the builtins, no repository');
  });

  await t.test("REFUSED: a read of the repository's own layer, which this api has none of", async () => {
    for (const kind of ['workflows', 'agents', 'skills']) {
      for (const url of [`${D}/${kind}?origin=repo`, `${D}/${kind}/anything?origin=repo`]) {
        const res = await app.request(url);
        const body = (await res.json()) as { error?: string };
        assert.equal(res.status, 422, `${url}: ${JSON.stringify(body)}`);
        assert.ok(body.error?.includes('?factory='), `${url} names the factory to pick: ${body.error}`);
      }
    }
  });
});
