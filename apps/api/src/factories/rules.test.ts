/**
 * A factory's rules on the board (rules.ts and the routes the table generates): a story of the rules read where the store keeps them,
 * written, rewritten, removed, and read with why when a hand wrote them with a frontmatter block; and one table of what the routes refuse
 * — in a scratch store whose factory is filed with the package's own verb. Every write is read back from disk, and every refusal leaves
 * the rules as they were.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, factoryRules } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { story } from '../../test/checkpoints.ts';
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

const NONE = { name: 'mill', file: FILE, words: null, error: null };

test("a person writes a factory's rules, rewrites them and removes them", async (t) => {
  const s = story(t);
  await s.test('GET reads no rules, and writes nothing', async () => {
    assert.deepEqual(await answered(app.request(URL)), NONE);
    assert.equal(fs.existsSync(FILE), false, 'a read writes nothing');
  });
  await s.test('PUT writes them in the store, trimmed, and GET reads them back', async () => {
    const written = await answered(send('PUT', URL, { words: '\n  Never push on a Friday.\n\n' }));
    assert.deepEqual(written, { ...NONE, words: 'Never push on a Friday.' });
    assert.equal(fs.readFileSync(FILE, 'utf8'), 'Never push on a Friday.\n');
    assert.deepEqual(await answered(app.request(URL)), written);
  });
  await s.test('a second PUT replaces them', async () => {
    const again = await answered(send('PUT', URL, { words: 'Write the test first.' }));
    assert.equal(again.words, 'Write the test first.');
    assert.equal(fs.readFileSync(FILE, 'utf8'), 'Write the test first.\n');
  });
  await s.test('DELETE removes them, and again removes nothing', async () => {
    assert.deepEqual(await answered(send('DELETE', URL, {})), { ...NONE, removed: true });
    assert.equal(fs.existsSync(FILE), false);
    assert.deepEqual(await answered(send('DELETE', URL, {})), { ...NONE, removed: false });
    assert.deepEqual(await answered(app.request(URL)), NONE);
  });
  await s.test(
    'rules a hand wrote with a frontmatter block are read with why they cannot be told, never refused, and a write replaces them',
    async () => {
      fs.mkdirSync(STORE, { recursive: true });
      fs.writeFileSync(FILE, '---\nmodel: opus\n---\nBe kind.\n');
      const read = await answered(app.request(URL));
      assert.equal(read.words, '---\nmodel: opus\n---\nBe kind.');
      assert.match(read.error ?? '', /RULES\.md opens with a frontmatter block/);
      assert.equal((await answered(send('PUT', URL, { words: 'Be kind.' }))).error, null);
      await answered(send('DELETE', URL, {}));
    },
  );
});

test('the rules routes: what a read or a write refuses, writing nothing', async (t) => {
  await t.test("a factory the store does not have is a 404 in the package's words, and no folder is made for it", async () => {
    const ghost = await refused(() => app.request('/api/factories/ghost/rules'), 404);
    assert.equal(
      ghost,
      packageSays(() => factoryRules('ghost')),
    );
    for (const fact of ['ghost', 'mill']) assert.ok(ghost.includes(fact), `${fact}: ${ghost}`);
    assert.match(await refused(() => send('PUT', '/api/factories/ghost/rules', { words: 'x' }), 404), /Nothing was written\.$/);
    assert.equal(fs.existsSync(path.join(root, 'factories', 'ghost')), false, 'no folder is made for a factory that is not there');
  });
  await t.test("the default factory is a 409 in the package's words, to read, write and remove", async () => {
    const fallback = await refused(() => app.request('/api/factories/default/rules'), 409);
    assert.equal(
      fallback,
      packageSays(() => factoryRules('default')),
    );
    assert.match(fallback, /nemia factory rules does not take it/);
    await refused(() => send('PUT', '/api/factories/default/rules', { words: 'No.' }), 409);
    await refused(() => send('DELETE', '/api/factories/default/rules', {}), 409);
    assert.equal(fs.existsSync(path.join(root, 'factories', 'default')), false);
  });
  await t.test('words that open with a frontmatter block, or are blank, are a 422, and the rules there are kept', async () => {
    await answered(send('PUT', URL, { words: 'Kept.' }));
    const fenced = await refused(() => send('PUT', URL, { words: '---\nallowedTools: Bash\n---\nUse Bash.' }), 422);
    assert.match(fenced, /RULES\.md opens with a frontmatter block/);
    assert.match(fenced, /Nothing was written\.$/);
    const blank = await refused(() => send('PUT', URL, { words: ' \n' }), 422);
    assert.ok(blank.startsWith('the rules of mill are blank'), blank);
    assert.ok(blank.includes('nemia factory rules mill --clear'), blank);
    assert.equal(held(), 'Kept.\n');
    await answered(send('DELETE', URL, {}));
  });
  await t.test('words left out, words that are no string, and a body that is not JSON are a 400 naming the route', async () => {
    const none = await refused(() => send('PUT', URL, {}), 400);
    assert.ok(none.startsWith('PUT /api/factories/mill/rules: `words`'), none);
    const wrong = await refused(() => send('PUT', URL, { words: 7 }), 400);
    assert.ok(wrong.endsWith("This request's was 7."), wrong);
    assert.match(await refused(() => send('PUT', URL, 'not json'), 400), /^PUT \/api\/factories\/mill\/rules takes a JSON body/);
  });
  await t.test("a name that is no factory's is a 400, to read and to write", async () => {
    await refused(() => app.request('/api/factories/Not%20One/rules'), 400);
    await refused(() => app.request('/api/factories/..%2Fmill/rules'), 400);
    await refused(() => send('PUT', '/api/factories/Not%20One/rules', { words: 'x' }), 400);
  });
});
