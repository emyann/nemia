/**
 * A factory's rules on the board (rules.ts and the routes the table generates): read where the store keeps them, written and removed — in
 * a scratch store whose factory is filed with the package's own verb. Every write is read back from disk, and every refusal is made to
 * refuse, asserted on the package's own words, with the store's folder as it was.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, factoryRules } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';

type FactoryRules = import('agent-orchestrator').FactoryRules;

addFactory({ name: 'mill', repos: [scratch('nemia-api-rules-folder-')] });

const STORE = path.join(root, 'factories', 'mill');
const FILE = path.join(STORE, 'RULES.md');
const URL = '/api/factories/mill/rules';

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown) =>
  app.request(url, { method, headers: json, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** What the request answered, its status asserted. */
async function answered(res: Response | Promise<Response>, status = 200): Promise<FactoryRules> {
  const answer = await res;
  const body = (await answer.json()) as FactoryRules;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** The rules' file, or null: what a refusal must leave as it was. */
const held = (): string | null => (fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null);

/** A request refused with `status`, its words, and the rules' file as it was. */
async function refused(res: () => Response | Promise<Response>, status: number): Promise<string> {
  const before = held();
  const answer = await res();
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, body.error);
  assert.equal(held(), before, 'a refused request leaves the rules as they were');
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

test('GET reads no rules; PUT writes them in the store, trimmed, and GET reads them back; DELETE removes them, and again removes nothing', async () => {
  const NONE = { name: 'mill', file: FILE, words: null, error: null };
  assert.deepEqual(await answered(app.request(URL)), NONE);
  assert.equal(fs.existsSync(FILE), false, 'a read writes nothing');

  const written = await answered(send('PUT', URL, { words: '\n  Never push on a Friday.\n\n' }));
  assert.deepEqual(written, { ...NONE, words: 'Never push on a Friday.' });
  assert.equal(fs.readFileSync(FILE, 'utf8'), 'Never push on a Friday.\n');
  assert.deepEqual(await answered(app.request(URL)), written);

  const again = await answered(send('PUT', URL, { words: 'Write the test first.' }));
  assert.equal(again.words, 'Write the test first.');
  assert.equal(fs.readFileSync(FILE, 'utf8'), 'Write the test first.\n');

  assert.deepEqual(await answered(send('DELETE', URL, {})), { ...NONE, removed: true });
  assert.equal(fs.existsSync(FILE), false);
  assert.deepEqual(await answered(send('DELETE', URL, {})), { ...NONE, removed: false });
  assert.deepEqual(await answered(app.request(URL)), NONE);
});

test('rules a hand wrote with a frontmatter block are read with why they cannot be told, never refused, and a write replaces them', async () => {
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(FILE, '---\nmodel: opus\n---\nBe kind.\n');
  const read = await answered(app.request(URL));
  assert.equal(read.words, '---\nmodel: opus\n---\nBe kind.');
  assert.match(read.error ?? '', /RULES\.md opens with a frontmatter block/);
  assert.equal((await answered(send('PUT', URL, { words: 'Be kind.' }))).error, null);
  await answered(send('DELETE', URL, {}));
});

test('REFUSED at shipped defaults: no factory (404), the default (409), a frontmatter block and blank words (422), words that are no string and a bad name (400) — writing nothing', async () => {
  const ghost = await refused(() => app.request('/api/factories/ghost/rules'), 404);
  assert.equal(
    ghost,
    packageSays(() => factoryRules('ghost')),
  );
  assert.match(ghost, /^no factory ghost in the store\. Its factories are: mill\. There are no rules to read\.$/);
  assert.match(await refused(() => send('PUT', '/api/factories/ghost/rules', { words: 'x' }), 404), /Nothing was written\.$/);
  assert.equal(fs.existsSync(path.join(root, 'factories', 'ghost')), false, 'no folder is made for a factory that is not there');

  const fallback = await refused(() => app.request('/api/factories/default/rules'), 409);
  assert.equal(
    fallback,
    packageSays(() => factoryRules('default')),
  );
  assert.match(fallback, /nemia factory rules does not take it/);
  await refused(() => send('PUT', '/api/factories/default/rules', { words: 'No.' }), 409);
  await refused(() => send('DELETE', '/api/factories/default/rules', {}), 409);
  assert.equal(fs.existsSync(path.join(root, 'factories', 'default')), false);

  await answered(send('PUT', URL, { words: 'Kept.' }));
  const fenced = await refused(() => send('PUT', URL, { words: '---\nallowedTools: Bash\n---\nUse Bash.' }), 422);
  assert.match(
    fenced,
    /RULES\.md opens with a frontmatter block, a first line of `---`\. A factory's rules only add words[^]*Nothing was written\.$/,
  );
  const blank = await refused(() => send('PUT', URL, { words: ' \n' }), 422);
  assert.match(blank, /^the rules of mill are blank[^]*nemia factory rules mill --clear\. Nothing was written\.$/);
  assert.equal(held(), 'Kept.\n');

  const none = await refused(() => send('PUT', URL, {}), 400);
  assert.match(none, /^PUT \/api\/factories\/mill\/rules: `words` are what every agent hired into the factory is told, a string/);
  const wrong = await refused(() => send('PUT', URL, { words: 7 }), 400);
  assert.ok(wrong.endsWith("This request's was 7."), wrong);
  assert.match(await refused(() => send('PUT', URL, 'not json'), 400), /^PUT \/api\/factories\/mill\/rules takes a JSON body/);

  await refused(() => app.request('/api/factories/Not%20One/rules'), 400);
  await refused(() => app.request('/api/factories/..%2Fmill/rules'), 400);
  await refused(() => send('PUT', '/api/factories/Not%20One/rules', { words: 'x' }), 400);
  await answered(send('DELETE', URL, {}));
});
