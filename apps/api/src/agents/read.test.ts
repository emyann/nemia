/**
 * `POST /api/agents/read`: an agent's file and the files beside it, read into its spec by the package's own reader (`agentDraftOf`),
 * writing nothing, in no namespace. Its answer is the spec a GET of the same files written to yours answers; a schema its `output:`
 * names and that was not sent is refused naming it, and a file that does not read is refused naming the file.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Agent, AgentDrafted } from 'objects';
import { app } from '../app.ts';

const AGENTS = path.join(root, 'workflows', 'agents');
const SCRIBE =
  '---\ndescription: Use this when a change needs its notes written.\nmodel: sonnet\nskills: [tidy]\noutput: scribe.schema.json\n---\nWrite the notes.\n';
const SCHEMA = `${JSON.stringify({ type: 'object', additionalProperties: false, required: ['notes'], properties: { notes: { type: 'string' } } })}\n`;

const read = (body: unknown) =>
  app.request('/api/agents/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Every file under the store, by its path there: what a read must leave as it was. */
const storeNow = (): string[] => (fs.existsSync(root) ? (fs.readdirSync(root, { recursive: true }) as string[]).sort() : []);

test("an agent's file and the schema beside it read as the spec a GET of the same files in yours answers, and write nothing", async () => {
  fs.mkdirSync(AGENTS, { recursive: true });
  fs.writeFileSync(path.join(AGENTS, 'scribe.md'), SCRIBE);
  fs.writeFileSync(path.join(AGENTS, 'scribe.schema.json'), SCHEMA);
  const got = await app.request('/api/namespaces/default/agents/scribe?origin=yours');
  const agent = (await got.json()) as Agent;
  assert.equal(got.status, 200, JSON.stringify(agent));
  assert.equal(agent.status.error, null, 'the file written to yours reads');
  fs.rmSync(path.join(AGENTS, 'scribe.md'));
  fs.rmSync(path.join(AGENTS, 'scribe.schema.json'));

  const before = storeNow();
  const files = [
    { path: 'scribe.md', text: SCRIBE },
    { path: 'scribe.schema.json', text: SCHEMA },
  ];
  const res = await read({ files });
  const answer = (await res.json()) as AgentDrafted;
  assert.equal(res.status, 200, JSON.stringify(answer));
  assert.deepEqual(answer, { metadata: { name: 'scribe' }, spec: agent.spec });
  const renamed = (await (await read({ name: 'notary', files })).json()) as AgentDrafted;
  assert.equal(renamed.metadata.name, 'notary', 'read under the name sent, where one is');
  assert.deepEqual(storeNow(), before, 'a read writes nothing');
});

test('REFUSED: a schema output: names and not sent, naming it; a file that does not read, naming the file; no file at all', async () => {
  for (const [what, body, names] of [
    ['a schema named and not sent', { files: [{ path: 'scribe.md', text: SCRIBE }] }, 'scribe.schema.json'],
    ['a file that does not read', { files: [{ path: 'broken.md', text: '---\ndescription: [Use this\n---\nBroken.\n' }] }, 'broken.md'],
    ['no file', { files: [] }, 'files'],
  ] as const) {
    const before = storeNow();
    const res = await read(body);
    const { error } = (await res.json()) as { error: string };
    assert.ok([400, 422].includes(res.status), `${what}: ${res.status} ${error}`);
    assert.ok(error.includes(names), `${what}: ${JSON.stringify(error)} names ${names}`);
    assert.deepEqual(storeNow(), before, `${what}: a refused read writes nothing`);
  }
});
