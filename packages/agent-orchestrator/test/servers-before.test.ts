/**
 * What a pass reads of a factory's MCP servers before it files a step (`serversBefore`), over the stand-in engine, whose
 * `mcpState` answers the states a test plants and counts the reads asked.
 *
 * The rule: a step whose factory server reports `needs-auth` is not filed, on a harness that files a sign-in. Each half is proven by
 * the fixture that would pass without it — the same server `connected`, which files; the same step on a harness that signs in to
 * nothing, which files; and a look that failed, which refuses nothing at all. And the read is one ask of the engine for a factory's
 * whole record, however many steps name it, which is the owner's answer about the probe's cost made into a test.
 *
 * A store of its own, since `WF_ROOT` is read as the package loads; the servers store itself takes this file's root by parameter,
 * as every caller of it does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from './scratch.ts';
import { eachTest } from './placed.ts';

const ROOT = scratch('wf-servers-before-');
process.env.WF_ROOT = ROOT;
const { engineOf, runWith } = await import('../src/runtime-client.ts');
const { serversBefore } = await import('../src/servers/servers.verb.ts');
const { writeFactoryServers } = await import('../src/servers/servers.store.ts');

const engine = eachTest(testEngine);

/** A factory name of its own per test, so no record one test wrote is read by the next. */
let n = 0;
const factory = eachTest(() => `pipao${++n}`);

/** The hosted GitHub server and a second, as a factory records them. */
const GITHUB = { type: 'http', url: 'https://api.githubcopilot.com/mcp/', oauth: { clientId: 'Iv23li' } } as const;
const DOCS = { type: 'http', url: 'https://docs.example/mcp' } as const;

/** What the pass read of this test's own factory's servers, over the stand-in as the test has planted it. */
const before = () => runWith(engineOf(engine().layer), serversBefore(factory(), ROOT));

test('a step whose factory server reports needs-auth is refused, and the same step with it connected is not', async () => {
  writeFactoryServers(ROOT, factory(), { github: GITHUB, docs: DOCS });
  engine().plantMcpState('github', { status: 'needs-auth' });
  engine().plantMcpState('docs', { status: 'connected', tools: 12 });
  const read = await before();
  assert.equal(read.refusal, null, 'the record reads: nothing refuses every step');
  const refused = read.refuses('claude', ['github', 'docs']);
  assert.match(refused!, new RegExp(`\`mcp: github, docs\` names \`github\`, which ${factory()} records and which reports needs-auth`));
  assert.match(refused!, /a session of it would reach no tool of that server/, 'why it is not started');
  assert.match(refused!, /Sign it in on the factory's settings page, then the next pass files the step/, 'and what to do');
  assert.equal(read.refuses('claude', ['docs']), null, 'the same read, the connected server alone: filed');
  assert.equal(read.refuses('claude', undefined), null, 'a step that names no server: filed');
  assert.equal(read.refuses('claude', ['repo']), null, "a name the factory does not record: the checkout's, and filed");
  assert.deepEqual(read.notes, [], 'and nothing is noted when every state was read');
});

test('the same step on a harness that files no sign-in of its own IS filed: it is shown its servers, never refused them', async () => {
  writeFactoryServers(ROOT, factory(), { github: GITHUB });
  engine().plantMcpState('github', { status: 'needs-auth' });
  const read = await before();
  assert.equal(read.refuses('codex', ['github']), null, 'nothing of its sign-in is measured, so nothing of it is refused');
  assert.equal(read.refuses('a2a:partner', ['github']), null, "nor a remote agent, which loads its own operator's servers");
  assert.ok(read.refuses('claude', ['github']), 'while the harness that does file one is still refused');
  assert.ok(read.refuses(undefined, ['github']), 'the default harness included: a step that names none runs on it');
});

test('a look that failed refuses nothing at all, and says the states are unread once for the pass', async () => {
  writeFactoryServers(ROOT, factory(), { github: GITHUB });
  engine().plantMcpState('github', { status: 'needs-auth' });
  engine().failMcpState('the session read no state within 45s');
  const read = await before();
  assert.equal(
    read.refuses('claude', ['github']),
    null,
    'an absence read off a failed look is not an absence: a step refused on a harness that was merely busy would be refused for ever',
  );
  assert.deepEqual(read.notes, [`the state of ${factory()}'s MCP servers is unread: the session read no state within 45s`]);
  assert.equal(read.refusal, null);
});

test('a factory that records no server asks the engine nothing: no session is spawned for a run that needs none', async () => {
  const read = await before();
  assert.deepEqual(read.notes, []);
  assert.equal(read.refuses('claude', ['repo']), null);
  assert.deepEqual(engine().mcpReads, [], 'no ask, so no CLI spawn');
});

test("the pass reads a factory's whole record in one ask, whatever the steps that name it", async () => {
  writeFactoryServers(ROOT, factory(), { github: GITHUB, docs: DOCS });
  engine().plantMcpState('github', { status: 'connected', tools: 46 });
  engine().plantMcpState('docs', { status: 'disabled' });
  const read = await before();
  assert.deepEqual(engine().mcpReads, [['github', 'docs']], 'one ask, every server of the record in it');
  for (const step of ['design', 'implement', 'review']) assert.equal(read.refuses('claude', ['github']), null, step);
  assert.deepEqual(engine().mcpReads.length, 1, 'and three steps judged off that one read, never one read per step');
});

test('a record that does not read refuses every step that names a server, naming the file and the command', async () => {
  const file = path.join(ROOT, 'factories', factory(), 'servers.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{');
  const read = await before();
  assert.match(read.refusal!, new RegExp(`the servers ${factory()} records cannot be read: .*servers\\.json is not JSON`));
  assert.match(read.refusal!, new RegExp(`nemia factory server add ${factory()}`), 'the command that writes it again');
  assert.ok(read.refuses('claude', ['github']), 'a step that names a server is not filed');
  assert.equal(read.refuses('claude', undefined), null, 'a step that names none is untouched by a record it never reads');
  assert.deepEqual(engine().mcpReads, [], 'and nothing was asked of the engine: there was no record to read states of');
});
