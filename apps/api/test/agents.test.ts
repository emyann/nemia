/**
 * The board's agents (agents.ts): listed from both places with the nodes that name them, one read, and one of yours made, put back,
 * renamed and removed — in a scratch store and a scratch repository. Every write is read back from disk, and every refusal is made to
 * refuse, asserted on its words, with the folder as it was.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-agents-'));
process.env.WF_ROOT = root;
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-agents-repo-'));
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

const { app } = await import('../src/app.ts');
type AgentListing = import('../src/agents.ts').AgentListing;
type AgentSaved = import('../src/agents.ts').AgentSaved;

const SHIPPED = path.join(import.meta.dirname, '..', '..', '..', 'workflows');
const STORE = path.join(root, 'workflows');
const AGENTS = path.join(STORE, 'agents');

// The repository's: the shipped agents and `dev`, whose steps name them. Yours: the same agents, and `dev` beside them.
fs.cpSync(path.join(SHIPPED, 'agents'), path.join(repo, 'workflows', 'agents'), { recursive: true });
fs.cpSync(path.join(SHIPPED, 'dev'), path.join(repo, 'workflows', 'dev'), { recursive: true });
fs.cpSync(path.join(SHIPPED, 'agents'), AGENTS, { recursive: true });
fs.cpSync(path.join(SHIPPED, 'dev'), path.join(STORE, 'dev'), { recursive: true });

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown, headers: Record<string, string> = json) =>
  app.request(url, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

const snapshot = (dir: string): Record<string, string> =>
  Object.fromEntries(fs.readdirSync(dir).sort().map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

/** A request refused with `status` and words `pattern` matches, and yours as it was. */
async function refused(res: Promise<Response>, status: number, pattern: RegExp): Promise<{ error: string; users?: string[] }> {
  const before = snapshot(AGENTS);
  const answer = await res;
  const body = (await answer.json()) as { error: string; users?: string[] };
  assert.equal(answer.status, status, body.error);
  assert.match(body.error, pattern);
  assert.deepEqual(snapshot(AGENTS), before, 'a refused write leaves yours as it was');
  return body;
}

const scribe = { name: 'scribe', description: 'Use this when a change needs its notes written.', keys: { model: 'sonnet', effort: 'low', tools: 'Read, Write' }, body: 'Write the notes.' };

async function listed(): Promise<AgentListing[]> {
  const res = await app.request('/api/agents');
  assert.equal(res.status, 200);
  return (await res.json()) as AgentListing[];
}

test('the agents of both places are listed, each with its keys, body, version and the nodes that name it', async () => {
  const all = await listed();
  const reviewer = all.find((a) => a.from === 'repo' && a.name === 'reviewer')!;
  assert.ok(reviewer, 'the repository\'s reviewer is listed');
  assert.ok(all.find((a) => a.from === 'yours' && a.name === 'reviewer'), 'yours too');
  assert.match(reviewer.description ?? '', /./);
  assert.equal(reviewer.keys.output, 'review.schema.json');
  assert.equal(reviewer.schema?.file, 'review.schema.json');
  assert.match(reviewer.schema?.text ?? '', /"properties"/);
  assert.match(reviewer.version, /^[0-9a-f]{16}$/);
  assert.deepEqual(reviewer.usedBy, [{ from: 'repo', workflow: 'dev', step: 'review' }]);
  assert.equal(reviewer.error, null);
  assert.ok(!all.some((a) => a.name === 'README'), 'the README is no agent');
});

test('an agent that does not read is listed with its refusal, and its lines as written', async () => {
  fs.writeFileSync(path.join(AGENTS, 'broken.md'), '---\nmodel: opus\ncheck: npm test\n---\nDo it.\n');
  try {
    const broken = (await listed()).find((a) => a.name === 'broken')!;
    assert.match(broken.error ?? '', /^agents\/broken\.md: `check` is wiring, and belongs on the step/);
    assert.deepEqual(broken.keys, { model: 'opus' });
    assert.equal(broken.body, 'Do it.');
  } finally {
    fs.rmSync(path.join(AGENTS, 'broken.md'));
  }
});

test('one agent is read by name; a name that is not an agent\'s, or a place that is not one, is refused before a file is read', async () => {
  const res = await app.request('/api/agents/repo/implementer');
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as AgentListing).name, 'implementer');
  await refused(app.request('/api/agents/yours/nobody'), 404, /^Yours has no agent named 'nobody'/);
  await refused(app.request('/api/agents/yours/..%2Fdev%2Fplan'), 400, /^`\.\.\/dev\/plan` is not an agent's name: an agent is a file in agents\//);
  await refused(app.request('/api/agents/elsewhere/reviewer'), 400, /an agent is read from `repo` or `yours`/);
});

test('an agent of yours is made, put back, renamed and removed, each read back from disk', async () => {
  const made = await send('POST', '/api/agents/yours', scribe);
  const saved = (await made.json()) as AgentSaved;
  assert.equal(made.status, 201, JSON.stringify(saved));
  assert.deepEqual(saved.written, ['scribe.md']);
  assert.equal(fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8'), '---\ndescription: Use this when a change needs its notes written.\nmodel: sonnet\neffort: low\ntools: Read, Write\n---\nWrite the notes.\n');

  const put = await send('PUT', '/api/agents/yours/scribe', { ...scribe, version: saved.agent.version, keys: { ...scribe.keys, effort: 'high', tools: null } });
  const edited = (await put.json()) as AgentSaved;
  assert.equal(put.status, 200, JSON.stringify(edited));
  assert.deepEqual(edited.agent.keys, { model: 'sonnet', effort: 'high' });

  const renamed = await send('PUT', '/api/agents/yours/scribe', { ...scribe, name: 'notary', version: edited.agent.version });
  const moved = (await renamed.json()) as AgentSaved;
  assert.equal(renamed.status, 200, JSON.stringify(moved));
  assert.deepEqual(moved.removed, ['scribe.md']);
  assert.ok(fs.existsSync(path.join(AGENTS, 'notary.md')));

  const gone = await send('DELETE', '/api/agents/yours/notary', { version: moved.agent.version });
  assert.equal(gone.status, 200);
  assert.equal(fs.existsSync(path.join(AGENTS, 'notary.md')), false);
});

test('a result schema pasted with an agent is written beside it', async () => {
  const text = JSON.stringify({ type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false });
  const res = await send('POST', '/api/agents/yours', { ...scribe, name: 'with-schema', keys: { output: 'with-schema.schema.json' }, schema: { file: 'with-schema.schema.json', text } });
  const saved = (await res.json()) as AgentSaved;
  assert.equal(res.status, 201, JSON.stringify(saved));
  assert.equal(saved.agent.schema?.text, text);
  assert.equal(fs.readFileSync(path.join(AGENTS, 'with-schema.schema.json'), 'utf8'), text);
  const gone = await send('DELETE', '/api/agents/yours/with-schema', { version: saved.agent.version });
  assert.deepEqual(((await gone.json()) as { removed: string[] }).removed, ['with-schema.md', 'with-schema.schema.json']);
});

test("a write to the repository's agents is refused, and nothing is written into the checkout", async () => {
  const theirs = snapshot(path.join(repo, 'workflows', 'agents'));
  await refused(send('POST', '/api/agents/repo', scribe), 403, /^POST \/api\/agents\/repo refuses to write the repository's agents/);
  await refused(send('PUT', '/api/agents/repo/reviewer', { ...scribe, version: 'x' }), 403, /cp .*reviewer\.md .* starts from this one/);
  await refused(send('DELETE', '/api/agents/repo/reviewer', { version: 'x' }), 403, /refuses to write the repository's agents/);
  await refused(send('POST', '/api/agents/elsewhere', scribe), 400, /the board writes yours, at \/api\/agents\/yours/);
  assert.deepEqual(snapshot(path.join(repo, 'workflows', 'agents')), theirs);
});

test('a write is guarded as every write of the board is: another site, another host, another content type', async () => {
  await refused(send('POST', '/api/agents/yours', scribe, { ...json, 'sec-fetch-site': 'cross-site' }), 403, /refuses a request made by a page on another site/);
  await refused(send('POST', '/api/agents/yours', scribe, { ...json, host: 'evil.example' }), 403, /refuses a request addressed to evil\.example/);
  await refused(send('DELETE', '/api/agents/yours/reviewer', { version: 'x' }, { 'content-type': 'text/plain' }), 415, /takes its body as `content-type: application\/json`/);
});

test("refusals carry the package's words: a key, a value, a name, a name taken, a stale version, and an agent still named", async () => {
  await refused(send('POST', '/api/agents/yours', { ...scribe, keys: { check: 'npm test' } }), 422, /^agents\/scribe\.md: `check` is wiring, and belongs on the step/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, keys: { agent: 'reviewer' } }), 422, /^agents\/scribe\.md: `agent` is a step's key/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, keys: { effort: 'enormous' } }), 422, /^agents\/scribe\.md: `effort: enormous`/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, name: 'x.md' }), 400, /^`x\.md` is not an agent's name/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, keys: { model: 7 } }), 400, /`keys\.model` is written as a string/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, name: 'reviewer' }), 409, /^agents\/reviewer\.md is there already/);
  await refused(send('PUT', '/api/agents/yours/reviewer', { ...scribe, name: 'reviewer' }), 400, /takes the `version` the agent was read at/);
  await refused(send('PUT', '/api/agents/yours/reviewer', { ...scribe, name: 'reviewer', version: '0123456789abcdef' }), 409, /^agents\/reviewer\.md changed since it was read/);
  await refused(send('PUT', '/api/agents/yours/nobody', { ...scribe, name: 'nobody', version: '0123456789abcdef' }), 404, /^agents\/nobody\.md is not there/);
  const reviewer = (await listed()).find((a) => a.from === 'yours' && a.name === 'reviewer')!;
  const inUse = await refused(send('DELETE', '/api/agents/yours/reviewer', { version: reviewer.version }), 409, /^agents\/reviewer\.md is named by a step beside it — dev\/review — and removing it would/);
  assert.deepEqual(inUse.users, ['dev/review']);
  await refused(send('PUT', '/api/agents/yours/reviewer', { ...scribe, name: 'critic', version: reviewer.version }), 409, /renaming it to critic would/);
  await refused(send('DELETE', '/api/agents/yours/reviewer', {}), 400, /takes the `version` the agent was read at/);
});
