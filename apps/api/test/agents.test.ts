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
import path from 'node:path';
import { scratch } from './scratch.ts';

// agent-orchestrator locates its store when the module loads, so point it at a scratch directory first.
const root = scratch('hkb-api-agents-');
process.env.WF_ROOT = root;
const repo = scratch('hkb-api-agents-repo-');
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

test('an agent that writes a list under its former name — `disallow:`, `allow:` — is listed under the name it has now, read or not; a save writes that name, and a page from before that sends the former one is refused', async () => {
  fs.writeFileSync(path.join(AGENTS, 'former.md'), '---\ndescription: Writes under the old names.\ndisallow: SendMessage\nallow: Edit(**)\n---\nDo it.\n');
  fs.writeFileSync(path.join(AGENTS, 'former-broken.md'), '---\ndisallow: SendMessage\nallow: Edit(**)\ncheck: npm test\n---\nDo it.\n');
  try {
    const agents = await listed();
    const former = agents.find((a) => a.name === 'former')!;
    assert.equal(former.error ?? null, null);
    assert.deepEqual(former.keys, { disallowedTools: 'SendMessage', allowedTools: 'Edit(**)' });
    const broken = agents.find((a) => a.name === 'former-broken')!;
    assert.match(broken.error ?? '', /`check` is wiring/);
    assert.deepEqual(broken.keys, { disallowedTools: 'SendMessage', allowedTools: 'Edit(**)' }, 'its lines as written, as the parser reads them, so the form can put it right');

    await refused(send('PUT', '/api/agents/yours/former', { name: 'former', description: former.description, keys: { disallow: 'SendMessage', allow: 'Edit(**)' }, body: former.body, version: former.version }), 422,
      /^agents\/former\.md: `disallow` is `disallowedTools`'s former name, .* reload it, and save again\.$/);
    const put = await send('PUT', '/api/agents/yours/former', { name: 'former', description: former.description, keys: former.keys, body: former.body, version: former.version });
    assert.equal(put.status, 200, await put.clone().text());
    assert.equal(fs.readFileSync(path.join(AGENTS, 'former.md'), 'utf8'), '---\ndescription: Writes under the old names.\ndisallowedTools: SendMessage\nallowedTools: Edit(**)\n---\nDo it.\n');
  } finally {
    fs.rmSync(path.join(AGENTS, 'former.md'), { force: true });
    fs.rmSync(path.join(AGENTS, 'former-broken.md'), { force: true });
  }
});

test("a codex agent that names its sandbox as `permissionMode:`, as before 2026-09-23, is listed with its `sandbox`, read or not; a save writes `sandbox:`, and a page from before that sends `permissionMode` is refused", async () => {
  fs.writeFileSync(path.join(AGENTS, 'fenced.md'), '---\ndescription: Reviews on codex.\nharness: codex\npermissionMode: bypassPermissions\n---\nReview it.\n');
  fs.writeFileSync(path.join(AGENTS, 'fenced-broken.md'), '---\nharness: codex\npermissionMode: read-only\ncheck: npm test\n---\nReview it.\n');
  fs.writeFileSync(path.join(AGENTS, 'moded-broken.md'), '---\nharness: claude\npermissionMode: dontAsk\ncheck: npm test\n---\nDo it.\n');
  try {
    const agents = await listed();
    const fenced = agents.find((a) => a.name === 'fenced')!;
    assert.equal(fenced.error ?? null, null);
    assert.deepEqual(fenced.keys, { harness: 'codex', sandbox: 'danger-full-access' });
    const broken = agents.find((a) => a.name === 'fenced-broken')!;
    assert.match(broken.error ?? '', /`check` is wiring/);
    assert.deepEqual(broken.keys, { harness: 'codex', sandbox: 'read-only' }, 'its lines as the parser reads them, so the form can put it right');
    assert.deepEqual(agents.find((a) => a.name === 'moded-broken')!.keys, { harness: 'claude', permissionMode: 'dontAsk' }, "a Claude Code agent's mode is its own");

    await refused(send('PUT', '/api/agents/yours/fenced', { name: 'fenced', description: fenced.description, keys: { harness: 'codex', permissionMode: 'bypassPermissions' }, body: fenced.body, version: fenced.version }), 422,
      /^agents\/fenced\.md: `permissionMode: bypassPermissions` on a step that runs on codex is what `sandbox:` was called there until 2026-09-23, .* Send `sandbox: danger-full-access` instead: .* reload it, and save again; .* clear it, and set the sandbox\.$/);
    const put = await send('PUT', '/api/agents/yours/fenced', { name: 'fenced', description: fenced.description, keys: fenced.keys, body: fenced.body, version: fenced.version });
    assert.equal(put.status, 200, await put.clone().text());
    assert.equal(fs.readFileSync(path.join(AGENTS, 'fenced.md'), 'utf8'), '---\ndescription: Reviews on codex.\nharness: codex\nsandbox: danger-full-access\n---\nReview it.\n');
  } finally {
    for (const name of ['fenced', 'fenced-broken', 'moded-broken']) fs.rmSync(path.join(AGENTS, `${name}.md`), { force: true });
  }
});

test('an agent that is a link is listed with its refusal alone: nothing of what it points at, outside the folder, is read', async () => {
  const outside = path.join(root, 'outside-agent.md');
  fs.writeFileSync(outside, '---\nmodel: opus\n---\nA secret from outside.\n');
  const outsideSchema = path.join(root, 'outside.schema.json');
  fs.writeFileSync(outsideSchema, '{"secret":true}');
  fs.symlinkSync(outside, path.join(AGENTS, 'linked.md'));
  fs.writeFileSync(path.join(AGENTS, 'schemed.md'), '---\noutput: schemed.schema.json\n---\nDo it.\n');
  fs.symlinkSync(outsideSchema, path.join(AGENTS, 'schemed.schema.json'));
  try {
    const agents = await listed();
    const linked = agents.find((a) => a.name === 'linked')!;
    assert.match(linked.error ?? '', /linked\.md is a link, and an agent's file is its own/);
    assert.equal(linked.source, '');
    assert.equal(linked.body, '');
    assert.deepEqual(linked.keys, {});
    const was = linked.version;
    fs.writeFileSync(outside, 'changed\n');
    assert.equal((await listed()).find((a) => a.name === 'linked')!.version, was, 'the version is not what the link points at');
    assert.equal(agents.find((a) => a.name === 'schemed')!.schema, null);
  } finally {
    for (const f of ['linked.md', 'schemed.md', 'schemed.schema.json']) fs.rmSync(path.join(AGENTS, f));
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

test('an agent is listed with what it says it can do: the card its `card:` names, its text, and the A2A skills read out of it', async () => {
  const reviewer = (await listed()).find((a) => a.from === 'repo' && a.name === 'reviewer')!;
  assert.equal(reviewer.card?.file, 'reviewer.skills.json');
  assert.equal(reviewer.card?.text, fs.readFileSync(path.join(repo, 'workflows', 'agents', 'reviewer.skills.json'), 'utf8'));
  assert.ok((reviewer.card?.list ?? []).length >= 1, 'the skills read out of it');
  for (const skill of reviewer.card!.list!) {
    assert.deepEqual(Object.keys(skill).filter((k) => ['id', 'name', 'description', 'tags'].includes(k)).sort(), ['description', 'id', 'name', 'tags']);
  }
  // An agent with no `card:` line says nothing it can do, and the field is null rather than an empty list.
  fs.writeFileSync(path.join(AGENTS, 'mute.md'), '---\ndescription: Says nothing.\n---\nDo it.\n');
  try {
    assert.equal((await listed()).find((a) => a.name === 'mute')!.card, null);
  } finally {
    fs.rmSync(path.join(AGENTS, 'mute.md'));
  }
});

test('an agent whose card does not read is listed with the parser’s refusal, and the file’s text all the same, so the form can fix it', async () => {
  fs.writeFileSync(path.join(AGENTS, 'wrong.md'), '---\ndescription: Tries.\ncard: wrong.skills.json\n---\nDo it.\n');
  fs.writeFileSync(path.join(AGENTS, 'wrong.skills.json'), '[{"id":"Shouting","name":"x","description":"y","tags":["z"]}]\n');
  try {
    const wrong = (await listed()).find((a) => a.name === 'wrong')!;
    assert.match(wrong.error ?? '', /^agents\/wrong\.md: `card: wrong\.skills\.json`, skill `Shouting` is not an id/);
    assert.equal(wrong.card?.file, 'wrong.skills.json');
    assert.match(wrong.card?.text ?? '', /Shouting/);
    assert.equal(wrong.card?.list, null, 'nothing was read out of it');
  } finally {
    for (const f of ['wrong.md', 'wrong.skills.json']) fs.rmSync(path.join(AGENTS, f));
  }
});

test('an agent whose card is not there keeps the line all the same: the form shows the name it holds, and a save is refused rather than taking the line off', async () => {
  fs.writeFileSync(path.join(AGENTS, 'gone.md'), '---\ndescription: Named a file that is not there.\ncard: gone.skills.json\nmodel: opus\n---\nDo it.\n');
  try {
    const gone = (await listed()).find((a) => a.name === 'gone')!;
    assert.match(gone.error ?? '', /^agents\/gone\.md: `card: gone\.skills\.json` is not there/);
    assert.equal(gone.card?.file, 'gone.skills.json', 'the file the agent names is what the form edits, there or not');
    assert.equal(gone.card?.text, '', 'with nothing in it, for there is nothing to read');
    assert.equal(gone.card?.list, null);

    // The draft the form sends for an untouched save: the line as read, and no text to write. The package refuses it by name, saying what
    // to do — and the line is still in the file. Read as no skills at all, this save would have written the agent back without it.
    const draft = { name: gone.name, description: gone.description, card: gone.card?.file ?? null, keys: gone.keys, body: gone.body };
    await refused(send('PUT', '/api/agents/yours/gone', { ...draft, version: gone.version }), 422, /^agents\/gone\.md: `card: gone\.skills\.json` is not there\. It is a list of A2A skills/);
    assert.match(fs.readFileSync(path.join(AGENTS, 'gone.md'), 'utf8'), /^card: gone\.skills\.json$/m);

    // What the form is for: the card pasted, the file written, and the agent reads.
    const said = [{ id: 'write-a-note', name: 'Write a note', description: 'Writes it.', tags: ['note'] }];
    const put = await send('PUT', '/api/agents/yours/gone', { ...draft, cardText: `${JSON.stringify(said, null, 2)}\n`, version: gone.version });
    const fixed = (await put.json()) as AgentSaved;
    assert.equal(put.status, 200, JSON.stringify(fixed));
    assert.deepEqual(fixed.agent.card?.list, said);
    assert.equal(fixed.agent.error, null);
  } finally {
    for (const f of ['gone.md', 'gone.skills.json']) fs.rmSync(path.join(AGENTS, f), { force: true });
  }
});

test('a new agent is written with its card beside it, and a save that changes the card writes that file and moves the version', async () => {
  const skills = [{ id: 'write-a-note', name: 'Write a note', description: 'Writes it.', tags: ['note'], examples: ['Use this when a note is wanted.'] }];
  const made = await send('POST', '/api/agents/yours', { ...scribe, card: 'scribe.skills.json', cardText: `${JSON.stringify(skills, null, 2)}\n` });
  const saved = (await made.json()) as AgentSaved;
  assert.equal(made.status, 201, JSON.stringify(saved));
  assert.deepEqual(saved.written.sort(), ['scribe.md', 'scribe.skills.json']);
  assert.match(fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8'), /^card: scribe\.skills\.json$/m);
  assert.deepEqual(saved.agent.card?.list, skills);

  // The card is digested with the agent, so a save against the version before it is refused.
  const was = saved.agent.version;
  const more = [...skills, { id: 'read-a-note', name: 'Read a note', description: 'Reads it.', tags: ['note'] }];
  const put = await send('PUT', `/api/agents/yours/scribe`, { ...scribe, version: was, card: 'scribe.skills.json', cardText: `${JSON.stringify(more, null, 2)}\n` });
  const again = (await put.json()) as AgentSaved;
  assert.equal(put.status, 200, JSON.stringify(again));
  assert.deepEqual(again.agent.card?.list?.map((s) => s.id), ['write-a-note', 'read-a-note']);
  assert.notEqual(again.agent.version, was, 'the card is digested with the agent');
  await refused(send('PUT', '/api/agents/yours/scribe', { ...scribe, version: was }), 409, /changed since it was read/);

  // The line taken off — the board's Card field cleared, and saved — leaves the file: a save never deletes what a person wrote.
  const off = await send('PUT', '/api/agents/yours/scribe', { ...scribe, version: again.agent.version });
  const bare = (await off.json()) as AgentSaved;
  assert.equal(off.status, 200, JSON.stringify(bare));
  assert.equal(bare.agent.card, null);
  assert.deepEqual(bare.removed, []);
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.skills.json')), true);
  fs.rmSync(path.join(AGENTS, 'scribe.skills.json'));
  await send('DELETE', '/api/agents/yours/scribe', { version: bare.agent.version });
});

test('REFUSED at shipped defaults: a card that is not a file name, text with no file to write it to, and a card the package will not read', async () => {
  await refused(send('POST', '/api/agents/yours', { ...scribe, card: 42 }), 400, /`card` is the file beside the agent that says what it can do/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, cardText: '[]' }), 400, /`cardText` is the text of the file `card` names, and this request named no `card` file/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, card: 'scribe.skills.txt', cardText: '[]' }), 422, /^`scribe\.skills\.txt` is not a card's name: it is a \.json file beside the agent/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, card: 'scribe.skills.json', cardText: '[]' }), 422, /is an empty list, and an agent with no skills says nothing it can do/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, card: 'scribe.skills.json', cardText: '[{"id":"a","name":"A"}]' }), 422, /skill 1 has no `description`/);
  // What a page drawn before the card had its own line sends: the card as `skills`, its text as `skillsText`. Neither is taken as something
  // else, and neither is dropped: each is refused, saying to reload.
  await refused(send('POST', '/api/agents/yours', { ...scribe, skills: 'scribe.skills.json', skillsText: '[]' }), 400, /`skillsText` is `cardText` since 2026-09-25[^]*reload it, and save again/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, skills: 'scribe.skills.json' }), 422, /`skills: scribe\.skills\.json` names a card, which is `card:` since 2026-09-25[^]*reload it, and save again/);
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'nothing was written');
});

test('an agent is written and listed with the skills it is given and its system prompt, each as its line writes it', async () => {
  const made = await send('POST', '/api/agents/yours', { ...scribe, keys: { ...scribe.keys, tools: 'Read, Write, Skill' }, skills: ' review-a-change,write-a-note ', systemPrompt: 'no-coding' });
  const saved = (await made.json()) as AgentSaved;
  assert.equal(made.status, 201, JSON.stringify(saved));
  try {
    const text = fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8');
    assert.match(text, /^skills: review-a-change,write-a-note$/m);
    assert.match(text, /^systemPrompt: no-coding$/m);
    assert.equal(saved.agent.skills, 'review-a-change, write-a-note', 'listed as the parser read it');
    assert.equal(saved.agent.systemPrompt, 'no-coding');
    assert.equal(saved.agent.card, null);
    // Neither is a role key: a step has no skills and no system prompt of its own.
    assert.equal(Object.hasOwn(saved.agent.keys, 'skills'), false);
    assert.equal(Object.hasOwn(saved.agent.keys, 'systemPrompt'), false);
  } finally {
    await send('DELETE', '/api/agents/yours/scribe', { version: saved.agent.version });
  }
});

test('REFUSED at shipped defaults: skills or a system prompt not written as text, and ones the package will not read', async () => {
  await refused(send('POST', '/api/agents/yours', { ...scribe, skills: ['a'] }), 400, /`skills` is the skills the agent is given, by name/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, systemPrompt: 1 }), 400, /`systemPrompt` is `"default"`, `"no-coding"` or `"own"`/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, systemPrompt: 'terse' }), 422, /systemPrompt/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, skills: 'Not A Name' }), 422, /Not A Name/);
  // At shipped defaults the scribe's tools are `Read, Write`: skills it could not load are refused (F11).
  await refused(send('POST', '/api/agents/yours', { ...scribe, skills: 'write-a-note' }), 422, /no `Skill`/);
  await refused(send('POST', '/api/agents/yours', { ...scribe, keys: { ...scribe.keys, harness: 'codex' }, skills: 'write-a-note' }), 422, /codex/);
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'nothing was written');
});

test('an agent is answered as an A2A Agent Card, with what it leaves out said beside it and never inside it', async () => {
  const res = await app.request('/api/agents/repo/reviewer/card');
  assert.equal(res.status, 200, await res.clone().text());
  const answer = (await res.json()) as import('../src/agents.ts').AgentCardAnswer;
  assert.equal(answer.servedOverA2A, false);
  assert.match(answer.why, /Nothing here serves reviewer over A2A/);
  assert.match(answer.why, /`supportedInterfaces` REQUIRED/);
  // A2A's required fields, but the interfaces nothing here has: the card is the card, and the sentence about it is not in it.
  assert.deepEqual(Object.keys(answer.card).sort(), ['capabilities', 'defaultInputModes', 'defaultOutputModes', 'description', 'name', 'skills', 'version']);
  assert.deepEqual(answer.card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
  assert.ok(answer.card.skills.length >= 1);
  const listing = (await listed()).find((a) => a.from === 'repo' && a.name === 'reviewer')!;
  assert.equal(answer.card.version, listing.version, 'the version is the one a save is held to');
  assert.deepEqual(answer.card.skills, listing.card?.list);
});

test('REFUSED at shipped defaults: a card for an agent that is not there, one with no skills, and one whose name is not an agent’s', async () => {
  await refused(app.request('/api/agents/yours/nobody/card'), 404, /^Yours has no agent named 'nobody'/);
  await refused(app.request('/api/agents/yours/..%2Fdev%2Fplan/card'), 400, /is not an agent's name/);
  fs.writeFileSync(path.join(AGENTS, 'mute.md'), '---\ndescription: Says nothing.\n---\nDo it.\n');
  fs.writeFileSync(path.join(AGENTS, 'nameless.md'), '---\ncard: nameless.skills.json\n---\nDo it.\n');
  fs.writeFileSync(path.join(AGENTS, 'nameless.skills.json'), '[{"id":"a","name":"A","description":"Does a.","tags":["note"]}]\n');
  try {
    await refused(app.request('/api/agents/yours/mute/card'), 422, /^agents\/mute\.md has no `card:`, and the A2A protocol marks a card's skills REQUIRED/);
    await refused(app.request('/api/agents/yours/nameless/card'), 422, /^agents\/nameless\.md has no `description:`, and the A2A protocol marks a card's description REQUIRED/);
  } finally {
    for (const f of ['mute.md', 'nameless.md', 'nameless.skills.json']) fs.rmSync(path.join(AGENTS, f));
  }
});
