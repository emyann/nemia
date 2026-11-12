/**
 * The cards group served (src/objects): a page walked by `continue` answers each card once, in name order, its `remainingItemCount`
 * counting down, and refuses a limit or a token that is not one; the namespaces are the cards' factories, `default` those that name none;
 * `labelSelector` and its retired spelling select alike. The guard before every write is `test/guarded.test.ts`'s.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TABLE_ACCEPT, type Card, type CardList, type Table } from 'objects';
import { app } from '../app.ts';

const inbox = path.join(root, 'inbox');

/** A card filed by hand, as `nemia inbox add` writes one: its factory and its labels in its front matter where given. */
const card = (name: string, keys: { factory?: string; team?: string } = {}) => {
  fs.mkdirSync(inbox, { recursive: true });
  const front = [...(keys.factory ? [`factory: ${keys.factory}`] : []), ...(keys.team ? [`labels: { team: ${keys.team} }`] : [])];
  fs.writeFileSync(path.join(inbox, `${name}.md`), front.length ? `---\n${front.join('\n')}\n---\nDo ${name}.\n` : `Do ${name}.\n`);
};

for (const name of ['c-1', 'c-2', 'c-3', 'c-4', 'c-5']) card(name, { team: name === 'c-2' || name === 'c-4' ? 'core' : 'infra' });
card('f-a', { factory: 'a' });

const list = async (url: string) => {
  const res = await app.request(url);
  return { status: res.status, body: (await res.json()) as typeof CardList.Type };
};

test('?limit=2 walked by continue answers each card once in name order, remainingItemCount 3, 1, 0, no continue on the last', async () => {
  const seen: string[] = [];
  const remaining: Array<number | undefined> = [];
  let next: string | undefined;
  let pages = 0;
  do {
    const { status, body } = await list(`/api/namespaces/default/cards?limit=2${next ? `&continue=${encodeURIComponent(next)}` : ''}`);
    assert.equal(status, 200);
    assert.equal(body.kind, 'CardList');
    seen.push(...body.items.map((c) => c.metadata.name));
    remaining.push(body.metadata.remainingItemCount);
    next = body.metadata.continue;
    pages++;
  } while (next && pages < 10);
  assert.deepEqual(seen, ['c-1', 'c-2', 'c-3', 'c-4', 'c-5']);
  assert.deepEqual(remaining, [3, 1, 0]);
});

test('a limit that is no whole number from 1, and a continue that is no token, are 422', async () => {
  for (const query of ['limit=0', 'limit=x', 'continue=not-a-token']) {
    const res = await app.request(`/api/cards?${query}`);
    assert.equal(res.status, 422, query);
    assert.equal(typeof ((await res.json()) as { error: unknown }).error, 'string', `${query} says why in \`error\``);
  }
});

test("/api/cards lists every card, /api/namespaces/default/cards those of no factory, and a card read in another's namespace is 404", async () => {
  assert.deepEqual(
    (await list('/api/cards')).body.items.map((c) => c.metadata.name),
    ['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'f-a'],
  );
  assert.ok(!(await list('/api/namespaces/default/cards')).body.items.some((c) => c.metadata.name === 'f-a'));
  const got = await app.request('/api/namespaces/a/cards/f-a');
  assert.equal(got.status, 200);
  const object = (await got.json()) as typeof Card.Type;
  assert.equal(object.kind, 'Card');
  assert.equal(object.metadata.namespace, 'a');
  assert.equal((await app.request('/api/namespaces/b/cards/f-a')).status, 404);
  assert.equal((await app.request('/api/namespaces/default/cards/no-such-card')).status, 404);
});

test('?labelSelector= and the retired ?selector= select the same cards, and a malformed one is 422', async () => {
  const by = (await list('/api/cards?labelSelector=team%3Dcore')).body.items.map((c) => c.metadata.name);
  assert.deepEqual(by, ['c-2', 'c-4']);
  assert.deepEqual(
    (await list('/api/cards?selector=team%3Dcore')).body.items.map((c) => c.metadata.name),
    by,
  );
  assert.equal((await app.request('/api/cards?labelSelector=team%20in%20(core')).status, 422);
});

test('a card filed, labelled, queued, taken off and dropped through the verbs is the object read after each', async () => {
  const headers = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  const filed = await app.request('/api/namespaces/default/cards', {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: 'A new one' }),
  });
  assert.equal(filed.status, 201);
  const made = (await filed.json()) as typeof Card.Type;
  assert.equal(made.kind, 'Card');
  const at = `/api/namespaces/default/cards/${made.metadata.name}`;
  const labelled = await app.request(`${at}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: ['team=core'] }) });
  assert.equal(labelled.status, 200);
  assert.equal(((await labelled.json()) as { kind: string }).kind, 'Card');
  const unqueued = await app.request(`${at}/unqueue`, { method: 'POST', headers, body: '{}' });
  assert.equal(unqueued.status, 200);
  const dropped = await app.request(at, { method: 'DELETE', headers, body: '{}' });
  assert.equal(dropped.status, 200);
  assert.equal((await app.request(at)).status, 404, 'gone once dropped');
});

test('a stray file of the same name as a card is passed over: the card is read and pressed by its verbs, never answered 404', async (t) => {
  card('z-notes');
  fs.writeFileSync(path.join(inbox, 'z-notes'), 'a stray file, no card\n');
  t.after(() => {
    fs.rmSync(path.join(inbox, 'z-notes'), { force: true });
    fs.rmSync(path.join(inbox, 'z-notes.md'), { force: true });
  });
  const at = '/api/namespaces/default/cards/z-notes';
  const read = await app.request(at);
  assert.equal(read.status, 200);
  assert.equal(((await read.json()) as typeof Card.Type).metadata.name, 'z-notes');
  const headers = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  const labelled = await app.request(`${at}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: ['team=core'] }) });
  assert.equal(labelled.status, 200);
});

test('GET /api/cards/:name finds a card in its factory, its file as written in status.source; a list carries no source', async () => {
  const got = await app.request('/api/cards/f-a');
  assert.equal(got.status, 200);
  const object = (await got.json()) as typeof Card.Type;
  assert.equal(object.metadata.namespace, 'a');
  assert.equal(object.status.source, fs.readFileSync(path.join(inbox, 'f-a.md'), 'utf8'));
  const inNamespace = (await (await app.request('/api/namespaces/a/cards/f-a')).json()) as typeof Card.Type;
  assert.equal(inNamespace.status.source, object.status.source, 'a read in its namespace carries it too');
  assert.equal((await app.request('/api/cards/no-such-card')).status, 404);
  for (const url of ['/api/cards', '/api/namespaces/default/cards'])
    for (const item of (await list(url)).body.items) assert.equal(item.status.source, undefined, `${url}: ${item.metadata.name}`);
});

test('PUT a card whole: spec.from set and answered; REFUSED: a stale resourceVersion and a started card are 409, the file as it was', async (t) => {
  const headers = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  const runs = path.join(root, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const run = (id: string, from?: string) =>
    fs.writeFileSync(
      path.join(runs, `${id}.json`),
      JSON.stringify({
        id,
        repo: '/code/app',
        workspace: '/code/app',
        baseRef: 'abc123',
        branch: 'main',
        isolate: true,
        brief: 'A brief',
        workflowDir: '/code/app/workflows',
        createdAt: '2026-11-05T00:00:00.000Z',
        workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
        steps: { implement: { taskId: null } },
        ...(from !== undefined ? { from: { inbox: from } } : {}),
      }),
    );
  card('w-1');
  card('w-started');
  run('ctx-a1');
  run('started-b2', 'w-started');
  t.after(() => {
    for (const name of ['w-1', 'w-started']) fs.rmSync(path.join(inbox, `${name}.md`), { force: true });
    for (const id of ['ctx-a1', 'started-b2']) fs.rmSync(path.join(runs, `${id}.json`), { force: true });
  });
  const at = '/api/namespaces/default/cards/w-1';
  const read = (await (await app.request(at)).json()) as typeof Card.Type;
  const put = (url: string, body: unknown) => app.request(url, { method: 'PUT', headers, body: JSON.stringify(body) });

  const written = await put(at, { metadata: { resourceVersion: read.metadata.resourceVersion }, spec: { ...read.spec, from: ['ctx-a1'] } });
  assert.equal(written.status, 200);
  const after = (await written.json()) as typeof Card.Type;
  assert.deepEqual(after.spec.from, ['ctx-a1']);
  assert.notEqual(after.metadata.resourceVersion, read.metadata.resourceVersion);
  assert.equal(after.status.source, fs.readFileSync(path.join(inbox, 'w-1.md'), 'utf8'));
  assert.match(after.status.source ?? '', /^from: ctx-a1$/m);

  const now = fs.readFileSync(path.join(inbox, 'w-1.md'), 'utf8');
  const stale = await put(at, { metadata: { resourceVersion: read.metadata.resourceVersion }, spec: { ...read.spec } });
  assert.equal(stale.status, 409);
  assert.equal(fs.readFileSync(path.join(inbox, 'w-1.md'), 'utf8'), now, 'a stale write writes nothing');

  const startedAt = '/api/namespaces/default/cards/w-started';
  const before = fs.readFileSync(path.join(inbox, 'w-started.md'), 'utf8');
  const started = await put(startedAt, { metadata: {}, spec: { body: 'Do it otherwise.' } });
  assert.equal(started.status, 409);
  assert.equal(fs.readFileSync(path.join(inbox, 'w-started.md'), 'utf8'), before, 'a started card keeps its file');
});

test("a card filed from runs that disagree on a label says the key it left out, each run with its value, on the filing's answer alone", async (t) => {
  const headers = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  const runs = path.join(root, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const run = (id: string, team: string) => {
    fs.writeFileSync(
      path.join(runs, `${id}.json`),
      JSON.stringify({
        id,
        repo: '/code/app',
        workspace: '/code/app',
        baseRef: 'abc123',
        branch: 'main',
        isolate: true,
        brief: 'A brief',
        workflowDir: '/code/app/workflows',
        createdAt: '2026-11-05T00:00:00.000Z',
        workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
        steps: { implement: { taskId: null } },
      }),
    );
    fs.writeFileSync(path.join(runs, `${id}.labels`), JSON.stringify({ team, area: 'inbox' }));
  };
  run('left-a1', 'core');
  run('left-b2', 'infra');
  const filedAs: string[] = [];
  t.after(() => {
    for (const name of filedAs) fs.rmSync(path.join(inbox, `${name}.md`), { force: true });
    for (const id of ['left-a1', 'left-b2'])
      for (const end of ['json', 'labels']) fs.rmSync(path.join(runs, `${id}.${end}`), { force: true });
  });
  const file = (body: string) => app.request('/api/namespaces/default/cards', { method: 'POST', headers, body: JSON.stringify({ body }) });

  const filed = await file('---\nfrom: left-a1, left-b2\n---\nShow the flag\n');
  assert.equal(filed.status, 201, await filed.clone().text());
  const made = (await filed.json()) as Card;
  filedAs.push(made.metadata.name);
  assert.deepEqual(made.metadata.labels, { area: 'inbox' }, 'what its from: runs agree on');
  assert.deepEqual(made.status.labelsLeftOut, [
    {
      key: 'team',
      values: [
        { run: 'left-a1', value: 'core' },
        { run: 'left-b2', value: 'infra' },
      ],
    },
  ]);
  const read = (await (await app.request(`/api/namespaces/default/cards/${made.metadata.name}`)).json()) as Card;
  assert.equal(read.status.labelsLeftOut, undefined, 'a read of the card says none');

  const plain = (await (await file('Plain idea')).json()) as Card;
  filedAs.push(plain.metadata.name);
  assert.equal(plain.status.labelsLeftOut, undefined, 'none left out, none said');
});

test('a card file that does not parse is listed all the same, its status saying why, and read alone with that why', async (t) => {
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, 'y-broken.md'), '---\nnot-a-key: 1\n---\nDo it.\n');
  t.after(() => fs.rmSync(path.join(inbox, 'y-broken.md'), { force: true }));
  const listed = (await list('/api/cards')).body.items.find((c) => c.metadata.name === 'y-broken');
  assert.ok(listed, 'listed, never hidden');
  assert.equal(listed.spec.body, undefined, 'no body read of a card that does not parse');
  assert.match(listed.status.error ?? '', /not-a-key/, 'its status says why, naming the key');
  const read = (await (await app.request('/api/namespaces/default/cards/y-broken')).json()) as typeof Card.Type;
  assert.match(read.status.error ?? '', /not-a-key/);
});

test('a list asked as a Table answers the columns nemia inbox prints and a row per card of the page, the card beside its cells', async () => {
  const res = await app.request('/api/namespaces/default/cards?limit=2&labelSelector=team%3Dcore', { headers: { accept: TABLE_ACCEPT } });
  assert.equal(res.status, 200);
  const table = (await res.json()) as Table;
  assert.equal(table.kind, 'Table');
  assert.equal(table.apiVersion, 'meta.k8s.io/v1');
  const names = table.columnDefinitions.map((c) => c.name);
  assert.deepEqual(names.slice(0, 4), ['Name', 'Title', 'Workflow', 'Repo']);
  const cell = (row: Table['rows'][number], name: string) => row.cells[names.indexOf(name)];
  assert.deepEqual(
    table.rows.map((row) => [cell(row, 'Name'), cell(row, 'Title'), cell(row, 'State'), cell(row, 'Queued')]),
    [
      ['c-2', 'Do c-2.', 'filed', null],
      ['c-4', 'Do c-4.', 'filed', null],
    ],
  );
  assert.equal((table.rows[0]?.object as Card | undefined)?.kind, 'Card');
  const plain = await list('/api/cards');
  assert.equal(plain.body.kind, 'CardList', 'a list asked for no Table is the CardList');
});
