/**
 * A factory's files (`POST /api/namespaces/<namespace>/files`) and a start that names them by id: three pictures of 3 MB in all, each
 * uploaded as its own form as `nemia start --input` uploads it, then a card started with their ids, its run's `inputs/` holding each
 * byte for byte, past the 1 MiB that every object write keeps; and what is refused — a file past its cap, a form with no file, a form a
 * write with no bearer token sends (but the board's, by its cookie with the header a script sets), an id no file of the namespace is
 * kept under — with nothing kept or started.
 *
 * Through the MCP port, a card's file given inline to its tool is uploaded and named by its id, and one past the inline bound is the
 * call's error with nothing kept.
 *
 * In a factory of the store (`acme`, the orchestrator's test team's `dev`), on a scratch repository: each run is written and nothing is
 * filed.
 */
import { root } from '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { keysUnder, runsNow, testPlace } from 'agent-orchestrator/testing';
import { Api, FILE_LIMIT, type FileObject, SCRIPTED_HEADER, TOKEN_COOKIE } from 'objects';
import { appOver, eachTest } from '../../test/placed.ts';
import { CLI_VERBS, TABLE } from 'agent-orchestrator';
import { TEAM } from '../../test/team.ts';
import { OBJECT_BODY_LIMIT } from '../objects/serve.ts';
import { called } from '../mcp/port.ts';
import { portTools } from '../mcp/tools.ts';
import { MAX_INLINE_BYTES } from '../mcp/files.ts';

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const repo = scratch('nemia-api-files-');
const stand = eachTest(() => {
  const place = testPlace();
  place.world.repository(repo, {});
  return place;
});
const engine = eachTest(testEngine);
const app = () => appOver(engine(), stand());
const tree = path.join(root, 'factories', 'acme', 'tree');
fs.cpSync(TEAM, path.join(tree, 'workflows'), { recursive: true });
write(
  path.join(root, 'factories', 'acme.json'),
  JSON.stringify({ volumes: [{ path: repo, readOnly: false }], template: { source: '/t/team', version: '0.1.0', params: {} } }),
);
write(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev'], hires: {} }));

/** The person's token, presented as a bearer, as `nemia` presents it. */
const BEARER = { authorization: 'Bearer harness-person-token-0123456789abcdefghijklmnopq' };

/** A form of one part, `file`, holding `bytes` named `name`, as `nemia start --input` sends each file. */
const formOf = (name: string, bytes: Buffer, type = 'image/png') => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
  return form;
};

/**
 * `form` uploaded to `namespace`'s files, with the headers given (the person's bearer where none): sent as the bytes and the
 * content-type a client puts on the wire, as `fetch` encodes a form.
 */
const upload = async (form: FormData, namespace = 'acme', headers: Record<string, string> = BEARER) => {
  const encoded = new Response(form);
  const body = new Uint8Array(await encoded.arrayBuffer());
  const type = encoded.headers.get('content-type') ?? '';
  return app().request(`/api/namespaces/${namespace}/files`, { method: 'POST', headers: { ...headers, 'content-type': type }, body });
};

/** `body` posted to `url` in `acme`'s namespace, as JSON. */
const post = (url: string, body: unknown) =>
  app().request(`/api/namespaces/acme/${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** What the factory's files folder holds now. */
const kept = () => {
  const dir = path.join(root, 'files', 'acme');
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
};

/** The run directories of the store now. */
const runCount = () => keysUnder(root, '/registry/runs/').length;

test('three pictures of 3 MB in all, each uploaded, start a card whose run holds each byte for byte, past the 1 MiB of an object write', async () => {
  const pictures = [
    { name: 'screenshot.png', bytes: crypto.randomBytes(1_100_000) },
    { name: 'export-light.png', bytes: crypto.randomBytes(1_000_000) },
    { name: 'export-dark.png', bytes: crypto.randomBytes(900_000) },
  ];
  assert.ok(pictures.reduce((sum, p) => sum + p.bytes.length, 0) >= 3_000_000);
  assert.ok(pictures.every((p) => p.bytes.length > Number(OBJECT_BODY_LIMIT) / 2));
  const files: FileObject[] = [];
  for (const { name, bytes } of pictures) {
    const res = await upload(formOf(name, bytes));
    assert.equal(res.status, 201, await res.clone().text());
    const file = (await res.json()) as FileObject;
    assert.match(file.id, /^file_[0-9a-f]{32}$/);
    assert.deepEqual([file.name, file.mediaType, file.size], [name, 'image/png', bytes.length]);
    assert.equal(
      file.digest,
      `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
      'its digest is sha256 of the bytes sent',
    );
    files.push(file);
  }
  write(path.join(root, 'inbox', 'pictured-card.md'), '---\nworkflow: dev\nfactory: acme\n---\nMatch the pictures.\n');
  const res = await post('cards/pictured-card/start', { inputs: files.map((f) => ({ file: f.id })) });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = (await res.json()) as { id: string };
  const run = runsNow(root).runs.read(id);
  assert.deepEqual(
    run.inputs,
    pictures.map((p) => p.name),
    'the run names each file by the name it was uploaded with',
  );
  for (const { name, bytes } of pictures)
    assert.ok(fs.readFileSync(path.join(root, 'runs', id, 'inputs', name)).equals(bytes), `${name} is in the run's inputs byte for byte`);
});

test("a start of a workflow names a file by its id and a name of its own beside a small file's text", async () => {
  const bytes = crypto.randomBytes(2_000_000);
  const file = (await (await upload(formOf('raw.bin', bytes, ''))).json()) as FileObject;
  assert.equal(file.mediaType, 'application/octet-stream', 'a part that says no media type is octet-stream');
  const res = await post('runs', {
    workflow: 'dev',
    brief: 'Read the export.',
    inputs: [
      { name: 'design.png', file: file.id },
      { name: 'notes.md', text: 'Read me first.\n' },
    ],
  });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = (await res.json()) as { id: string };
  const inputs = path.join(root, 'runs', id, 'inputs');
  assert.ok(fs.readFileSync(path.join(inputs, 'design.png')).equals(bytes));
  assert.equal(fs.readFileSync(path.join(inputs, 'notes.md'), 'utf8'), 'Read me first.\n');
});

test('REFUSED: a file a byte past its cap is a 413 `TooLarge`, and nothing of it is kept', async () => {
  const before = kept();
  const res = await upload(formOf('huge.png', Buffer.alloc(Number(FILE_LIMIT) + 1)));
  assert.equal(res.status, 413, await res.clone().text());
  assert.equal(((await res.json()) as { _tag?: string; error: string }).error.includes(String(Number(FILE_LIMIT))), true);
  assert.deepEqual(kept(), before);
});

test('a file at its cap is kept whole', async () => {
  const res = await upload(formOf('full.png', Buffer.alloc(Number(FILE_LIMIT), 7)));
  assert.equal(res.status, 201, await res.clone().text());
  const file = (await res.json()) as FileObject;
  assert.equal(file.size, Number(FILE_LIMIT));
  assert.equal(fs.statSync(path.join(root, 'files', 'acme', file.id)).size, Number(FILE_LIMIT));
});

test('REFUSED: a form whose part is no file, and one of two parts, are a 422, and nothing is kept', async () => {
  const before = kept();
  const field = new FormData();
  field.append('file', 'just words');
  const two = formOf('a.png', Buffer.from('a'));
  two.append('file', new Blob([new Uint8Array([1])]), 'b.png');
  const other = new FormData();
  other.append('picture', new Blob([new Uint8Array([1])]), 'p.png');
  for (const form of [field, two, other]) {
    const res = await upload(form);
    assert.equal(res.status, 422, await res.clone().text());
  }
  assert.deepEqual(kept(), before);
});

/** The board's cookie, holding the person's token, as the browser sends it on the board's every request. */
const COOKIE = { cookie: `${TOKEN_COOKIE}=harness-person-token-0123456789abcdefghijklmnopq` };

test('REFUSED: a form sent with no bearer token, by the board’s cookie without the header a script sets, is a 415 before its body is read', async () => {
  const before = kept();
  const res = await upload(formOf('a.png', Buffer.from('a')), 'acme', COOKIE);
  assert.equal(res.status, 415, await res.clone().text());
  assert.deepEqual(kept(), before);
});

test('a form sent by the board’s cookie with the header a script sets, from the board’s own page, is kept as a bearer’s is', async () => {
  const res = await upload(formOf('a.png', Buffer.from('a')), 'acme', {
    ...COOKIE,
    [SCRIPTED_HEADER]: 'XMLHttpRequest',
    'sec-fetch-site': 'same-origin',
  });
  assert.equal(res.status, 201, await res.clone().text());
  const file = (await res.json()) as FileObject;
  assert.equal(fs.readFileSync(path.join(root, 'files', 'acme', file.id), 'utf8'), 'a');
});

test('REFUSED: a form sent by the board’s cookie with the header a script sets, from a page on another port of this host, is a 403', async () => {
  const before = kept();
  const res = await upload(formOf('a.png', Buffer.from('a')), 'acme', {
    ...COOKIE,
    [SCRIPTED_HEADER]: 'XMLHttpRequest',
    'sec-fetch-site': 'same-site',
  });
  assert.equal(res.status, 403, await res.clone().text());
  assert.deepEqual(kept(), before);
});

test('REFUSED: a file uploaded to a namespace that names no factory is kept nowhere', async () => {
  const res = await upload(formOf('a.png', Buffer.from('a')), 'nowhere');
  assert.ok(res.status === 404 || res.status === 422, `${res.status}: ${await res.clone().text()}`);
  assert.equal(fs.existsSync(path.join(root, 'files', 'nowhere')), false);
});

test('REFUSED: a start naming an id no file of its namespace is kept under, or a file uploaded to another, is a 422, nothing started', async () => {
  const elsewhere = (await (await upload(formOf('a.png', Buffer.from('a')), 'default')).json()) as FileObject;
  const before = runCount();
  for (const file of [`file_${'0'.repeat(32)}`, elsewhere.id, '../acme.json']) {
    const res = await post('runs', { workflow: 'dev', brief: 'Read it.', inputs: [{ file }] });
    assert.equal(res.status, 422, `${file}: ${await res.clone().text()}`);
    assert.match(((await res.json()) as { error: string }).error, /--input/);
  }
  assert.equal(runCount(), before);
});

test('REFUSED: an input with no name and no file is a 422, nothing started', async () => {
  const before = runCount();
  const res = await post('runs', { workflow: 'dev', brief: 'Read it.', inputs: [{ text: 'x' }] });
  assert.equal(res.status, 422, await res.clone().text());
  assert.equal(runCount(), before);
});

test('an uploaded picture is streamed inline as its own type, and an SVG only as an attachment', async () => {
  const bytes = crypto.randomBytes(2000);
  const put = await upload(formOf('shot.png', bytes));
  assert.equal(put.status, 201, await put.clone().text());
  const file = (await put.json()) as FileObject;
  const content = await app().request(`/api/namespaces/acme/files/${file.id}/content`);
  assert.equal(content.status, 200);
  assert.equal(content.headers.get('content-type'), 'image/png');
  assert.equal(content.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await content.arrayBuffer()), bytes);
  const svg = await upload(formOf('logo.svg', Buffer.from('<svg/>'), 'image/svg+xml'));
  const svgFile = (await svg.json()) as FileObject;
  const served = await app().request(`/api/namespaces/acme/files/${svgFile.id}/content`);
  assert.equal(served.headers.get('content-type'), 'application/octet-stream');
  assert.match(served.headers.get('content-disposition') ?? '', /^attachment/);
});

test('REFUSED: the content of an id never kept is Missing', async () => {
  assert.equal((await app().request(`/api/namespaces/acme/files/file_${'0'.repeat(32)}/content`)).status, 404);
});

test('a card filed with a kept file says it in its status, attaches another and takes it off; an unknown id is refused', async () => {
  const shot = (await (await upload(formOf('shot.png', crypto.randomBytes(300)))).json()) as FileObject;
  const log = (await (await upload(formOf('run.log', Buffer.from('a log\n'), 'text/plain'))).json()) as FileObject;
  const filed = await post('cards', { body: 'Look at ![it](shot.png).', workflow: 'dev', files: [{ file: shot.id }] });
  assert.equal(filed.status, 201, await filed.clone().text());
  const card = (await filed.json()) as {
    metadata: { name: string };
    status: { files?: { name: string; inText: boolean; kept: boolean }[] };
  };
  assert.deepEqual(
    card.status.files?.map((f) => [f.name, f.inText, f.kept]),
    [['shot.png', true, true]],
  );
  const name = card.metadata.name;
  const attached = await post(`cards/${name}/files`, { files: [{ file: log.id }] });
  assert.equal(attached.status, 200, await attached.clone().text());
  const after = (await attached.json()) as typeof card;
  assert.deepEqual(
    after.status.files?.map((f) => [f.name, f.inText]),
    [
      ['shot.png', true],
      ['run.log', false],
    ],
  );
  const detached = await app().request(`/api/namespaces/acme/cards/${name}/files/run.log`, {
    method: 'DELETE',
    headers: { ...BEARER, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(detached.status, 200, await detached.clone().text());
  assert.deepEqual(
    ((await detached.json()) as typeof card).status.files?.map((f) => f.name),
    ['shot.png'],
  );
  const unknown = await post('cards', { body: 'Another.', workflow: 'dev', files: [{ file: `file_${'0'.repeat(32)}` }] });
  assert.equal(unknown.status, 422);
});

test("the port lists a card's files as an id or the files extension's FileInput, uploads its inline data, and refuses one past the inline bound or with no data", async () => {
  const tools = portTools(TABLE, CLI_VERBS, Api);
  const attach = tools.find((t) => t.name === 'inbox_attach');
  assert.ok(attach, 'the port has a tool for attaching files to a card');
  assert.deepEqual(attach.fileKeys, ['files']);
  assert.equal(
    tools
      .filter((t) => t.fileKeys.length > 0)
      .every(
        (t) =>
          JSON.stringify(t.inputSchema).includes('"contentEncoding":"base64"') && JSON.stringify(t.inputSchema).includes('"x-mcp-file"'),
      ),
    true,
    'each tool that takes files marks its FileInput x-mcp-file, its data in base64',
  );
  write(path.join(root, 'inbox', 'port-card.md'), '---\nworkflow: dev\nfactory: acme\n---\nLook at ![it](shot.png).\n');
  const from = new Request('http://127.0.0.1:8787/mcp', { method: 'POST', headers: BEARER });
  const shot = crypto.randomBytes(500);
  const result = await called(
    attach,
    {
      namespace: 'acme',
      name: 'port-card',
      files: [{ id: 'f1', name: 'shot.png', mimeType: 'image/png', size: shot.length, data: shot.toString('base64') }],
    },
    from,
    { fetch: (r) => app().fetch(r) },
  );
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  const card = result.structuredContent as { status: { files?: { name: string; file: string; kept: boolean }[] } };
  assert.deepEqual(
    card.status.files?.map((f) => [f.name, f.kept]),
    [['shot.png', true]],
  );
  const id = card.status.files?.[0]?.file ?? '';
  assert.deepEqual(fs.readFileSync(path.join(root, 'files', 'acme', id)), shot);
  const before = kept();
  const past = await called(
    attach,
    {
      namespace: 'acme',
      name: 'port-card',
      files: [
        {
          id: 'f2',
          name: 'big.bin',
          mimeType: 'application/octet-stream',
          size: MAX_INLINE_BYTES + 1,
          data: Buffer.alloc(MAX_INLINE_BYTES + 1).toString('base64'),
        },
      ],
    },
    from,
    { fetch: (r) => app().fetch(r) },
  );
  assert.equal(past.isError, true);
  assert.deepEqual(kept(), before);
  const unsent = await called(
    attach,
    { namespace: 'acme', name: 'port-card', files: [{ id: 'f3', name: 'later.png', mimeType: 'image/png', size: 10 }] },
    from,
    { fetch: (r) => app().fetch(r) },
  );
  assert.equal(unsent.isError, true, 'a FileInput with no data is refused: this port takes no upload out of band');
  assert.deepEqual(kept(), before);
});
