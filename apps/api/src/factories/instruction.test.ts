/**
 * A factory's instruction on the board (instruction.ts and the routes the table generates): read where its file says it is kept, moved
 * between its first folder and the store, and the store's text written and cleared — in a scratch store whose factory is filed with the
 * package's own verb. Every write is read back from disk, and every refusal is made to refuse, asserted on the package's own words, with
 * the factory's file and the store's folder as they were.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, factoryInstruction, setInstruction } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';

type FactoryInstruction = import('agent-orchestrator').FactoryInstruction;

const own = scratch('nemia-api-instruction-own-');
process.env.HKB_REPO = own;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: own });
const folder = scratch('nemia-api-instruction-folder-');
addFactory({ name: 'mill', repos: [folder] });

const RECORD = path.join(root, 'factories', 'mill.json');
const STORE = path.join(root, 'factories', 'mill');

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown) =>
  app.request(url, { method, headers: json, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** What the request answered, its status asserted. */
async function answered(res: Response | Promise<Response>, status = 200): Promise<FactoryInstruction> {
  const answer = await res;
  const body = (await answer.json()) as FactoryInstruction;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** The factory's file and the store's folder: what a refusal must leave as it was. */
const held = (): [string, string[]] => [fs.readFileSync(RECORD, 'utf8'), fs.existsSync(STORE) ? fs.readdirSync(STORE) : []];

/** A request refused with `status`, its words, and the factory's file and the store's folder as they were. */
async function refused(res: () => Response | Promise<Response>, status: number): Promise<string> {
  const before = held();
  const answer = await res();
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, body.error);
  assert.deepEqual(held(), before, 'a refused request leaves the factory as it was');
  return body.error;
}

/** What the package itself throws for `call`, to compare with what the api answered. */
function packageSays(call: () => unknown): string {
  try {
    call();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('the package refused nothing');
}

test("GET reads NEMIA.md in the factory's first folder; PUT a path reads that file; PUT the store and its words write the store's file; DELETEs undo each", async () => {
  const bare = await answered(app.request('/api/factories/mill/instruction'));
  assert.deepEqual(bare, {
    name: 'mill',
    path: null,
    store: false,
    file: path.join(folder, 'NEMIA.md'),
    words: null,
    error: null,
    stored: false,
  });
  fs.writeFileSync(path.join(folder, 'NEMIA.md'), 'Read the folder.\n');
  assert.equal((await answered(app.request('/api/factories/mill/instruction'))).words, 'Read the folder.\n');

  fs.mkdirSync(path.join(folder, 'docs'));
  fs.writeFileSync(path.join(folder, 'docs', 'NEMIA.md'), 'Read the docs.\n');
  const moved = await answered(send('PUT', '/api/factories/mill/instruction', { path: 'docs/NEMIA.md' }));
  assert.deepEqual([moved.path, moved.file, moved.words], ['docs/NEMIA.md', path.join(folder, 'docs', 'NEMIA.md'), 'Read the docs.\n']);
  assert.deepEqual(JSON.parse(fs.readFileSync(RECORD, 'utf8')).instruction, { path: 'docs/NEMIA.md' });

  const stored = await answered(send('PUT', '/api/factories/mill/instruction', { store: true }));
  assert.deepEqual([stored.store, stored.file, stored.words], [true, path.join(STORE, 'NEMIA.md'), null]);
  const written = await answered(send('PUT', '/api/factories/mill/instruction/words', { words: '  Keep it short.\n\n' }));
  assert.deepEqual([written.words, written.stored], ['Keep it short.\n', true]);
  assert.equal(fs.readFileSync(path.join(STORE, 'NEMIA.md'), 'utf8'), 'Keep it short.\n');
  assert.equal(
    fs.existsSync(path.join(folder, 'NEMIA.md')) && fs.readFileSync(path.join(folder, 'NEMIA.md'), 'utf8'),
    'Read the folder.\n',
  );

  const cleared = await answered(send('DELETE', '/api/factories/mill/instruction/words', {}));
  assert.deepEqual([cleared.words, cleared.stored, fs.existsSync(path.join(STORE, 'NEMIA.md'))], [null, false, false]);

  const back = await answered(send('DELETE', '/api/factories/mill/instruction', {}));
  assert.deepEqual([back.path, back.store, back.words], [null, false, 'Read the folder.\n']);
  assert.equal('instruction' in JSON.parse(fs.readFileSync(RECORD, 'utf8')), false, 'a clear removes the key');
});

test("REFUSED at shipped defaults: no factory (404), the default (409), words for a folder's file (409), a path out of the folder and blank words (422), a bad name (400) — writing nothing", async () => {
  const ghost = await refused(() => app.request('/api/factories/ghost/instruction'), 404);
  assert.equal(
    ghost,
    packageSays(() => factoryInstruction('ghost')),
  );
  assert.match(ghost, /^no factory ghost in the store\. Its factories are: mill\. There is no instruction to read\.$/);
  assert.match(await refused(() => send('PUT', '/api/factories/ghost/instruction', { store: true }), 404), /Nothing was changed\.$/);

  const fallback = await refused(() => app.request('/api/factories/default/instruction'), 409);
  assert.equal(
    fallback,
    packageSays(() => factoryInstruction('default')),
  );
  await refused(() => send('PUT', '/api/factories/default/instruction/words', { words: 'No.' }), 409);

  const inFolder = await refused(() => send('PUT', '/api/factories/mill/instruction/words', { words: 'Not here.' }), 409);
  assert.ok(inFolder.includes(path.join(folder, 'NEMIA.md')), inFolder);
  assert.equal(fs.existsSync(path.join(STORE, 'NEMIA.md')), false, 'no store file is written for words refused');

  const out = await refused(() => send('PUT', '/api/factories/mill/instruction', { path: '../NEMIA.md' }), 422);
  assert.equal(
    out,
    packageSays(() => setInstruction({ factory: 'mill', at: { path: '../NEMIA.md' } })),
  );
  const absolute = await refused(() => send('PUT', '/api/factories/mill/instruction', { path: '/etc/passwd' }), 422);
  assert.ok(absolute.includes('is absolute'), absolute);

  const none = await refused(() => send('PUT', '/api/factories/mill/instruction', {}), 422);
  assert.ok(none.includes('is put in one place'), none);

  await answered(send('PUT', '/api/factories/mill/instruction', { store: true }));
  const blank = await refused(() => send('PUT', '/api/factories/mill/instruction/words', { words: ' \n' }), 422);
  assert.match(blank, /^the instruction of mill is blank/);

  await refused(() => app.request('/api/factories/Not%20One/instruction'), 400);
  await refused(() => send('PUT', '/api/factories/Not%20One/instruction/words', { words: 'x' }), 400);
  await answered(send('DELETE', '/api/factories/mill/instruction', {}));
});
