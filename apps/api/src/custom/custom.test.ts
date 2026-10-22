/**
 * A person's custom instructions on the board (custom.ts): read, written and cleared in a scratch store, for an agent of a scratch
 * repository and one of yours. Every write is read back from disk, and every refusal is made to refuse, asserted on the package's own
 * words, with the folder as it was.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { writeCustomInstructions } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
const repo = scratch('nemia-api-custom-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

type CustomInstructionsAnswer = import('./custom.ts').CustomInstructionsAnswer;
type CustomInstructionsCleared = import('./custom.ts').CustomInstructionsCleared;

const CUSTOM = path.join(root, 'custom-instructions');

fs.mkdirSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'scribe.md'), '---\ndescription: Writes it down.\n---\nWrite it down.\n');
fs.mkdirSync(path.join(root, 'workflows', 'agents'), { recursive: true });
fs.writeFileSync(path.join(root, 'workflows', 'agents', 'archivist.md'), '---\ndescription: Files it away.\n---\nFile it away.\n');

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown, headers: Record<string, string> = json) =>
  app.request(url, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** What the store's custom-instructions folder holds: each file's text by its name, `{}` when there is no folder. */
const held = (): Record<string, string> =>
  fs.existsSync(CUSTOM)
    ? Object.fromEntries(
        fs
          .readdirSync(CUSTOM)
          .sort()
          .map((f) => [f, fs.lstatSync(path.join(CUSTOM, f)).isSymbolicLink() ? 'a link' : fs.readFileSync(path.join(CUSTOM, f), 'utf8')]),
      )
    : {};

/** A request refused with `status`, its words, and the folder as it was. */
async function refused(res: () => Response | Promise<Response>, status: number): Promise<string> {
  const before = held();
  const answer = await res();
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, body.error);
  assert.deepEqual(held(), before, 'a refused write leaves the folder as it was');
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

test("GET answers none for an agent without custom instructions; PUT writes your store's file and GET reads it back; DELETE removes it", async () => {
  const none = (await (await app.request('/api/custom-instructions/scribe')).json()) as CustomInstructionsAnswer;
  assert.deepEqual(none, { name: 'scribe', file: path.join(root, 'custom-instructions', 'scribe.md'), words: null, error: null });

  const put = await send('PUT', '/api/custom-instructions/scribe', { words: '  Write it down in French.\n\n' });
  const written = (await put.json()) as CustomInstructionsAnswer;
  assert.equal(put.status, 200, JSON.stringify(written));
  assert.equal(written.words, 'Write it down in French.');
  assert.equal(fs.readFileSync(path.join(CUSTOM, 'scribe.md'), 'utf8'), 'Write it down in French.\n');
  assert.equal(
    fs.existsSync(path.join(repo, 'custom-instructions')),
    false,
    "the repository's agent's words are yours, not the checkout's",
  );
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).includes('custom'), false);
  const read = (await (await app.request('/api/custom-instructions/scribe')).json()) as CustomInstructionsAnswer;
  assert.equal(read.words, 'Write it down in French.');

  const yours = await send('PUT', '/api/custom-instructions/archivist', { words: 'File it by date.' });
  assert.equal(yours.status, 200, 'an agent of yours takes custom instructions too');

  for (const name of ['scribe', 'archivist']) {
    const first = await send('DELETE', `/api/custom-instructions/${name}`, {});
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { name, file: path.join(CUSTOM, `${name}.md`), removed: true });
    const again = (await (await send('DELETE', `/api/custom-instructions/${name}`, {})).json()) as CustomInstructionsCleared;
    assert.equal(again.removed, false, 'a second clear finds none');
  }
  assert.deepEqual(held(), {});
});

test('REFUSED at shipped defaults: a name no place has (404, read, written or cleared), blank words and a frontmatter block (422), each in the words the package says, writing nothing', async () => {
  const ghost = await refused(() => send('PUT', '/api/custom-instructions/ghost', { words: 'Boo.' }), 404);
  assert.equal(
    ghost,
    packageSays(() => writeCustomInstructions(root, 'ghost', 'Boo.', repo)),
  );
  assert.ok(ghost.includes('The agents there: archivist, scribe.'), ghost);
  assert.equal(await refused(() => send('DELETE', '/api/custom-instructions/ghost', {}), 404), ghost);
  assert.equal(await refused(() => app.request('/api/custom-instructions/ghost'), 404), ghost);

  const blank = await refused(() => send('PUT', '/api/custom-instructions/scribe', { words: ' \n\n' }), 422);
  assert.equal(
    blank,
    packageSays(() => writeCustomInstructions(root, 'scribe', ' \n\n', repo)),
  );
  assert.match(blank, /^the custom instructions for scribe are blank/);

  const keyed = '---\ntools: Bash\n---\nUse Bash.\n';
  const frontmatter = await refused(() => send('PUT', '/api/custom-instructions/scribe', { words: keyed }), 422);
  assert.equal(
    frontmatter,
    packageSays(() => writeCustomInstructions(root, 'scribe', keyed, repo)),
  );
  assert.ok(frontmatter.includes('opens with a frontmatter block'), frontmatter);
  assert.deepEqual(held(), {});
});

test('REFUSED: words that are not a string (400 naming `words`), and a name that climbs (400)', async () => {
  const seven = await refused(() => send('PUT', '/api/custom-instructions/scribe', { words: 7 }), 400);
  assert.ok(seven.startsWith('PUT /api/custom-instructions/scribe: `words` are what the agent is told') && seven.endsWith('was 7.'), seven);
  const climbs = await refused(() => send('PUT', '/api/custom-instructions/..%2Fx', { words: 'Out.' }), 400);
  assert.ok(climbs.includes("is not an agent's name"), climbs);
  const read = await refused(() => app.request('/api/custom-instructions/..%2Fx'), 400);
  assert.ok(read.startsWith('GET /api/custom-instructions/../x:'), read);
  assert.equal(fs.existsSync(path.join(root, 'x.md')), false);
});

test("GET answers a file that does not read with the package's refusal in `error`, and a save replaces it", async () => {
  fs.mkdirSync(CUSTOM, { recursive: true });
  const outside = path.join(root, 'outside.md');
  fs.writeFileSync(outside, 'Elsewhere.\n');
  fs.symlinkSync(outside, path.join(CUSTOM, 'scribe.md'));
  try {
    const res = await app.request('/api/custom-instructions/scribe');
    const answer = (await res.json()) as CustomInstructionsAnswer;
    assert.equal(res.status, 200);
    assert.equal(answer.words, null);
    assert.match(answer.error ?? '', /is a link/);
    const saved = (await (await send('PUT', '/api/custom-instructions/scribe', { words: 'Mine.' })).json()) as CustomInstructionsAnswer;
    assert.deepEqual([saved.words, saved.error], ['Mine.', null]);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Elsewhere.\n', 'never written through the link');
  } finally {
    fs.rmSync(CUSTOM, { recursive: true, force: true });
  }
});

test('DELETE reads no body: what its route fixes clears the words, whatever the body says; a key another command takes on the api is a 422', async () => {
  for (const body of [undefined, 'not json', JSON.stringify({ words: 'Kept?' })]) {
    writeCustomInstructions(root, 'scribe', 'Mind the margins.', repo);
    const res = await app.request('/api/custom-instructions/scribe', { method: 'DELETE', headers: json, body });
    assert.equal(res.status, 200, `${body}: ${await res.clone().text()}`);
    assert.deepEqual(held(), {}, String(body));
  }
  const foreign = await refused(() => send('PUT', '/api/custom-instructions/scribe', { words: 'Hi.', answers: [] }), 422);
  assert.equal(
    foreign,
    '`answers` is not a key PUT …/custom-instructions/:name takes — POST …/retry, POST …/approve take it — so it would go nowhere: ' +
      '`{ "words": "<what the agent is told after its instructions>" }`.',
  );
});

test('REFUSED at shipped defaults: a PUT without `words`, which the api alone takes and requires — 400 in its words, nothing written', async () => {
  const none = await refused(() => send('PUT', '/api/custom-instructions/scribe', {}), 400);
  assert.equal(
    none,
    'PUT /api/custom-instructions/scribe: `words` are what the agent is told after its instructions, a string: ' +
      '`{ "words": "<what the agent is told after its instructions>" }`. This request\'s was undefined.',
  );
});

test('a key the command line alone takes — `file`, `repo` — is none of the body: whatever it holds, the words are written in your store', async () => {
  const res = await send('PUT', '/api/custom-instructions/scribe', { words: 'Ignore the rest.', file: 7, repo: ['/elsewhere'] });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(((await res.json()) as CustomInstructionsAnswer).words, 'Ignore the rest.');
  assert.deepEqual(held(), { 'scribe.md': 'Ignore the rest.\n' });
  assert.equal((await send('DELETE', '/api/custom-instructions/scribe', {})).status, 200, 'cleared, for the tests after');
});
