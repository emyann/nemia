/**
 * A person's custom instructions for an agent (handlers.ts, the Agent's `…/agents/<name>/instructions`): read, written and cleared in a
 * scratch store, for an agent of a scratch repository and one of yours; read in any namespace and written in `default` alone, one record
 * per agent's name. Every write is read back from disk, and every refusal is made to refuse, asserted on its status and a fragment of its
 * words, with the folder as it was.
 *
 * One story — a person putting custom instructions, reading them back, saving over a file that does not read, and clearing them — then
 * one table of what the paths refuse.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, writeCustomInstructions } from 'agent-orchestrator';
import { scratch } from 'test-kit/scratch';
import { app } from '../app.ts';
import { story } from 'test-kit/checkpoints';
const repo = scratch('nemia-api-custom-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
addFactory({ name: 'elsewhere', repos: [repo] });

type CustomInstructionsAnswer = import('objects').AgentInstructions;
type CustomInstructionsCleared = import('objects').AgentInstructionsCleared;

/** Where an agent's custom instructions are, in `namespace` (`default` unless said). */
const at = (name: string, namespace = 'default') => `/api/namespaces/${namespace}/agents/${name}/instructions`;

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

test('a person’s custom instructions for an agent: none at first, put in your store and read back, saved over a file that does not read, cleared whatever the body says, the command line’s keys none of the body', async (t) => {
  const s = story(t);

  await s.test(
    "GET answers none for an agent without custom instructions; PUT writes your store's file and GET reads it back; DELETE removes it",
    async () => {
      const none = (await (await app.request(at('scribe'))).json()) as CustomInstructionsAnswer;
      assert.deepEqual(none, { name: 'scribe', file: path.join(root, 'custom-instructions', 'scribe.md'), words: null, error: null });

      const put = await send('PUT', at('scribe'), { words: '  Write it down in French.\n\n' });
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
      const read = (await (await app.request(at('scribe'))).json()) as CustomInstructionsAnswer;
      assert.equal(read.words, 'Write it down in French.');

      const yours = await send('PUT', at('archivist'), { words: 'File it by date.' });
      assert.equal(yours.status, 200, 'an agent of yours takes custom instructions too');

      for (const name of ['scribe', 'archivist']) {
        const first = await send('DELETE', at(name), {});
        assert.equal(first.status, 200);
        assert.deepEqual(await first.json(), { name, file: path.join(CUSTOM, `${name}.md`), removed: true });
        const again = (await (await send('DELETE', at(name), {})).json()) as CustomInstructionsCleared;
        assert.equal(again.removed, false, 'a second clear finds none');
      }
      assert.deepEqual(held(), {});
    },
  );

  await s.test('one record per agent name: read in any namespace, the same as in `default`', async () => {
    assert.equal((await send('PUT', at('scribe'), { words: 'Everywhere the same.' })).status, 200);
    const res = await app.request(at('scribe', 'elsewhere'));
    const read = (await res.json()) as CustomInstructionsAnswer;
    assert.equal(res.status, 200, JSON.stringify(read));
    assert.deepEqual([read.words, read.file], ['Everywhere the same.', path.join(CUSTOM, 'scribe.md')]);
    assert.equal((await send('DELETE', at('scribe'), {})).status, 200, 'cleared, for what follows');
  });

  await s.test("GET answers a file that does not read with the package's refusal in `error`, and a save replaces it", async () => {
    fs.mkdirSync(CUSTOM, { recursive: true });
    const outside = path.join(root, 'outside.md');
    fs.writeFileSync(outside, 'Elsewhere.\n');
    fs.symlinkSync(outside, path.join(CUSTOM, 'scribe.md'));
    try {
      const res = await app.request(at('scribe'));
      const answer = (await res.json()) as CustomInstructionsAnswer;
      assert.equal(res.status, 200);
      assert.equal(answer.words, null);
      assert.match(answer.error ?? '', /is a link/);
      const saved = (await (await send('PUT', at('scribe'), { words: 'Mine.' })).json()) as CustomInstructionsAnswer;
      assert.deepEqual([saved.words, saved.error], ['Mine.', null]);
      assert.equal(fs.readFileSync(outside, 'utf8'), 'Elsewhere.\n', 'never written through the link');
    } finally {
      fs.rmSync(CUSTOM, { recursive: true, force: true });
    }
  });

  await s.test('DELETE reads no body: what its route fixes clears the words, whatever the body says', async () => {
    for (const body of [undefined, 'not json', JSON.stringify({ words: 'Kept?' })]) {
      writeCustomInstructions(root, 'scribe', 'Mind the margins.', repo);
      const res = await app.request(at('scribe'), { method: 'DELETE', headers: json, body });
      assert.equal(res.status, 200, `${body}: ${await res.clone().text()}`);
      assert.deepEqual(held(), {}, String(body));
    }
  });

  await s.test(
    'a key the body does not take — `file`, `repo` the command line takes, `answers` another verb takes — is none of it: whatever it holds, the words are written in your store',
    async () => {
      const res = await send('PUT', at('scribe'), { words: 'Ignore the rest.', file: 7, repo: ['/elsewhere'], answers: [] });
      assert.equal(res.status, 200, await res.clone().text());
      assert.equal(((await res.json()) as CustomInstructionsAnswer).words, 'Ignore the rest.');
      assert.deepEqual(held(), { 'scribe.md': 'Ignore the rest.\n' });
      assert.equal((await send('DELETE', at('scribe'), {})).status, 200, 'cleared, for what follows');
    },
  );
});

test('what the instructions refuse — a name no place has, blank words, a frontmatter block, words not a string or none, a name that climbs, a write outside `default` — each in its status and a fact of its words, writing nothing', async (t) => {
  await t.test(
    "REFUSED at shipped defaults: a name no place has (404, read, written or cleared), blank words and a frontmatter block (422), each in the package's words, writing nothing",
    async () => {
      const ghost = await refused(() => send('PUT', at('ghost'), { words: 'Boo.' }), 404);
      assert.ok(ghost.includes('The agents there: archivist, scribe.'), ghost);
      assert.equal(await refused(() => send('DELETE', at('ghost'), {}), 404), ghost);
      assert.equal(await refused(() => app.request(at('ghost')), 404), ghost);

      const blank = await refused(() => send('PUT', at('scribe'), { words: ' \n\n' }), 422);
      assert.match(blank, /^the custom instructions for scribe are blank/);

      const keyed = '---\ntools: Bash\n---\nUse Bash.\n';
      const frontmatter = await refused(() => send('PUT', at('scribe'), { words: keyed }), 422);
      assert.ok(frontmatter.includes('opens with a frontmatter block'), frontmatter);
      assert.deepEqual(held(), {});
    },
  );

  await t.test('REFUSED: words that are not a string, or none (400 naming `payload.words`), and a name that climbs (400)', async () => {
    for (const body of [{ words: 7 }, {}]) {
      const before = held();
      const res = await send('PUT', at('scribe'), body);
      const refusal = (await res.json()) as { error: string; field?: string };
      assert.equal(res.status, 400, refusal.error);
      assert.equal(refusal.field, 'payload.words', JSON.stringify(body));
      assert.deepEqual(held(), before, 'nothing written');
    }
    const climbs = await refused(() => send('PUT', at('..%2Fx'), { words: 'Out.' }), 400);
    assert.ok(climbs.includes("is not an agent's name"), climbs);
    const read = await refused(() => app.request(at('..%2Fx')), 400);
    assert.ok(read.startsWith('GET /api/namespaces/default/agents/../x/instructions:'), read);
    assert.equal(fs.existsSync(path.join(root, 'x.md')), false);
  });

  await t.test('REFUSED: a write or a clear outside `default` (422), naming the namespace that takes it, nothing written', async () => {
    const put = await refused(() => send('PUT', at('scribe', 'elsewhere'), { words: 'Here.' }), 422);
    assert.ok(put.includes('/api/namespaces/default/'), put);
    assert.ok((await refused(() => send('DELETE', at('scribe', 'elsewhere'), {}), 422)).includes('/api/namespaces/default/'));
  });
});
