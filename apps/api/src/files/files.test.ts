/**
 * A factory's files (`POST /api/namespaces/<namespace>/files`) and a start that names them by id: three pictures of 3 MB in all, each
 * uploaded as its own form as `nemia start --input` uploads it, then a card started with their ids, its run's `inputs/` holding each
 * byte for byte, past the 1 MiB that every object write keeps; and what is refused — a file past its cap, a form with no file, a form a
 * write with no bearer token sends, an id no file of the namespace is kept under — with nothing kept or started.
 *
 * In a factory of the store (`acme`, the orchestrator's test team's `dev`), on a scratch repository: each run is written and nothing is
 * filed.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { FILE_LIMIT, type FileObject, TOKEN_COOKIE } from 'objects';
import { appOver, eachTest } from '../../test/placed.ts';
import { runsAtOnce } from 'agent-orchestrator';
import { TEAM } from '../../test/team.ts';
import { OBJECT_BODY_LIMIT } from '../objects/serve.ts';

const write = (file: string, text: string): void => {
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
  JSON.stringify({ repos: [repo], template: { source: '/t/team', version: '0.1.0', params: {} } }),
);
write(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev'], hires: {} }));

/** The person's token, presented as a bearer, as `nemia` presents it. */
const BEARER = { authorization: 'Bearer harness-person-token-0123456789abcdefghijklmnopq' };

/** A form of one part, `file`, holding `bytes` named `name`, as `nemia start --input` sends each file. */
const formOf = (name: string, bytes: Buffer, type = 'image/png'): FormData => {
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
const kept = (): string[] => {
  const dir = path.join(root, 'files', 'acme');
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
};

/** The run directories of the store now. */
const runCount = (): number => fs.readdirSync(path.join(root, 'runs')).length;

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
    files.push(file);
  }
  write(path.join(root, 'inbox', 'pictured-card.md'), '---\nworkflow: dev\nfactory: acme\n---\nMatch the pictures.\n');
  const res = await post('cards/pictured-card/start', { inputs: files.map((f) => ({ file: f.id })) });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = (await res.json()) as { id: string };
  const run = runsAtOnce(root).runs.read(id);
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

test('REFUSED: a form sent with no bearer token, by the board’s cookie or none, is a 415 before its body is read', async () => {
  const before = kept();
  const res = await upload(formOf('a.png', Buffer.from('a')), 'acme', {
    cookie: `${TOKEN_COOKIE}=harness-person-token-0123456789abcdefghijklmnopq`,
  });
  assert.equal(res.status, 415, await res.clone().text());
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
