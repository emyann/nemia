/**
 * A factory's MCP servers on the board as objects (mcp-servers.ts, `/api/namespaces/<factory>/mcpservers`): the record read where the
 * store keeps it, a server recorded and removed, each header masked, and Nemia's builtin servers (`/api/builtin/mcpservers`) — in a
 * scratch store whose factory is filed with the package's own verb.
 * Every write is read back from disk, and every refusal is made to refuse, with the record as it was.
 *
 * The states are not read here: a read of one spawns a harness session, which no api test does. What the api answers of a record it
 * could not read states of is the thing to hold, and it is held: no `state` on each server, its `status.error` saying why.
 */
import { root } from '../../../test/harness.ts';
import { test } from 'node:test';
import { story } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_SERVERS, builtinServers } from 'agent-orchestrator';
import { addFactory } from 'agent-orchestrator/testing';
import { HEADER_MASK } from 'objects';
import { scratch } from 'test-kit/scratch';
import { app } from '../../app.ts';

type McpServer = import('objects').McpServer;
type McpServerList = import('objects').McpServerList;

addFactory({ name: 'mcpmill', repos: [scratch('nemia-api-servers-folder-')] });

const FILE = path.join(root, 'factories', 'mcpmill', 'servers.json');
const URL = '/api/namespaces/mcpmill/mcpservers';
const BUILTIN = '/api/builtin/mcpservers';

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown) =>
  app.request(url, { method, headers: json, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** The record's file, or null: what a refusal must leave as it was. */
const held = (): string | null => (fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null);

/** A request refused with `status`, its words, and the record as it was. */
async function refused(res: () => Response | Promise<Response>, status: number): Promise<string> {
  const before = held();
  const answer = await res();
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, JSON.stringify(body));
  assert.equal(held(), before, 'the record is as it was');
  return body.error;
}

test("A person keeps a factory's MCP servers: none recorded, one recorded and read back with its state unread, each refusal leaving the record, the server removed, and Nemia's builtin servers offered", async (t) => {
  const s = story(t);
  await s.test('a factory with no record answers an empty list, and no state is unread: there was nothing to read', async () => {
    const read = await answered<McpServerList>(app.request(URL));
    assert.equal(read.kind, 'McpServerList');
    assert.deepEqual(read.items, [], 'no server, no ask, no spawn');
    assert.deepEqual(
      (await answered<McpServerList>(app.request(BUILTIN))).items.map((s) => s.metadata.name),
      ['github'],
      "and Nemia's builtin servers, offered whatever the record holds",
    );
  });
  await s.test('a server recorded is read back off the record, with its state null while no state was read', async () => {
    await answered(
      send('PUT', `${URL}/github`, {
        url: 'https://api.githubcopilot.com/mcp/',
        headers: { 'X-MCP-Toolsets': 'actions,repos' },
        oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
      }),
    );
    assert.deepEqual(JSON.parse(held()!), {
      servers: {
        github: {
          type: 'http',
          url: 'https://api.githubcopilot.com/mcp/',
          headers: { 'X-MCP-Toolsets': 'actions,repos' },
          oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
        },
      },
    });
    const read = await answered<McpServerList>(app.request(URL));
    assert.equal(read.items.length, 1);
    const [github] = read.items;
    assert.equal(github.metadata.name, 'github');
    assert.equal(github.metadata.namespace, 'mcpmill');
    assert.equal(github.spec.url, 'https://api.githubcopilot.com/mcp/');
    assert.deepEqual(github.spec.headers, { 'X-MCP-Toolsets': HEADER_MASK }, 'a header is served masked');
    assert.equal(github.status?.state, undefined, 'no harness here to ask, so the state is unread — which is not an absence');
    assert.ok(github.status?.error, "and the read says why in the runtime's words");
    assert.deepEqual(await answered<McpServer>(app.request(`${URL}/github`)), github, 'got as it is listed');
  });
  await s.test('a mask sent back for a header keeps the value stored, and a mask for a header the record has not is refused', async () => {
    await answered(send('PUT', `${URL}/github`, { url: 'https://api.githubcopilot.com/mcp/', headers: { 'X-MCP-Toolsets': HEADER_MASK } }));
    assert.deepEqual((JSON.parse(held() ?? '{}') as { servers: { github: { headers: Record<string, string> } } }).servers.github.headers, {
      'X-MCP-Toolsets': 'actions,repos',
    });
    await refused(
      () => send('PUT', `${URL}/github`, { url: 'https://api.githubcopilot.com/mcp/', headers: { 'X-Other': HEADER_MASK } }),
      422,
    );
  });
  await s.test("REFUSED: an Authorization header, a local server, a name that is no server's and a name that is no factory's", async () => {
    assert.match(
      await refused(
        () => send('PUT', `${URL}/github`, { url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer x' } }),
        422,
      ),
      /`Authorization` is a credential/,
    );
    const badName = await refused(() => send('PUT', `${URL}/Nope!`, { url: 'https://e.example/mcp' }), 422);
    assert.ok(badName.startsWith('PUT /api/namespaces/mcpmill/mcpservers/Nope!: '), badName);
    assert.match(badName, /`Nope!` is not a server's name/);
    assert.match(
      await refused(() => send('PUT', '/api/namespaces/Nope!/mcpservers/github', { url: 'https://e.example/mcp' }), 422),
      /is not a factory's name/,
    );
    assert.match(await refused(() => send('PUT', `${URL}/local`, { url: 'not-an-address' }), 422), /`url` is the address it is reached at/);
    assert.match(await refused(() => app.request('/api/namespaces/Nope!/mcpservers'), 422), /is not a factory's name/);
    assert.match(await refused(() => app.request('/api/namespaces/nosuch/mcpservers'), 404), /nosuch/);
    assert.equal((await app.request('/api/factories/mcpmill/servers')).status, 404, 'the retired route answers nothing');
  });
  await s.test('a server removed leaves the record, and one the factory does not record is 404', async () => {
    assert.match(await refused(() => send('DELETE', `${URL}/nosuch`, {}), 404), /nosuch/);
    assert.equal((await answered<McpServer>(send('DELETE', `${URL}/github`, {}))).metadata.name, 'github', 'answered what it took off');
    assert.equal(held(), null, 'the last server gone, the file is removed rather than left empty');
    assert.deepEqual((await answered<McpServerList>(app.request(URL))).items, []);
  });
  await s.test('the builtin read answers what the builtin folder holds, a spec each and no namespace', async () => {
    const read = await answered<McpServerList>(app.request(BUILTIN));
    assert.equal(read.kind, 'McpServerList');
    assert.deepEqual(
      read.items.map((s) => [s.metadata.name, s.metadata.namespace, s.spec, s.status]),
      [
        [
          'github',
          undefined,
          {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            headers: { 'X-MCP-Toolsets': 'context,repos,issues,pull_requests,users,actions' },
            oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
          },
          undefined,
        ],
      ],
      'GitHub, with its client id and its header as shipped, which names no secret, and no key that names a secret',
    );
  });
});

test("Nemia's builtin servers are the orchestrator package's own folder, never a folder of the checkout's team", () => {
  const pkg = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'packages', 'agent-orchestrator');
  assert.equal(path.relative(pkg, path.resolve(BUILTIN_SERVERS)), 'servers', 'the folder is packages/agent-orchestrator/servers');
  assert.ok(
    builtinServers(BUILTIN_SERVERS).some((s) => s.name === 'github'),
    "GitHub's hosted server is a builtin one",
  );
});
