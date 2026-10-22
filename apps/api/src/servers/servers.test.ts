/**
 * A factory's MCP servers on the board (servers.ts and the routes the table generates): the record read where the store keeps it, a
 * server recorded and removed, and the servers Nemia ships — in a scratch store whose factory is filed with the package's own verb.
 * Every write is read back from disk, and every refusal is made to refuse, with the record as it was.
 *
 * The states are not read here: a read of one spawns a harness session, which no api test does. What the api answers of a record it
 * could not read states of is the thing to hold, and it is held: a `state` of null on each server, with `unread` saying why.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
import { shippedServers, SHIPPED_SERVERS } from './servers.ts';

type FactoryServersRead = import('./servers.ts').FactoryServersRead;

addFactory({ name: 'mcpmill', repos: [scratch('nemia-api-servers-folder-')] });

const FILE = path.join(root, 'factories', 'mcpmill', 'servers.json');
const URL = '/api/factories/mcpmill/servers';

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

test('a factory with no record answers an empty list, and no state is unread: there was nothing to read', async () => {
  const read = await answered<FactoryServersRead>(app.request(URL));
  assert.deepEqual(read.servers, []);
  assert.equal(read.unread, null, 'no server, no ask, no spawn');
  assert.deepEqual(read.shipped, [], 'and Nemia ships none today');
});

test('a server recorded is read back off the record, with its state null while no state was read', async () => {
  await answered(
    send('PUT', `${URL}/github`, {
      url: 'https://api.githubcopilot.com/mcp/',
      header: ['X-MCP-Toolsets=actions,repos'],
      clientId: 'Iv23liQBfm9prqhvXkuY',
      callbackPort: '8791',
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
  const read = await answered<FactoryServersRead>(app.request(URL));
  assert.equal(read.servers.length, 1);
  assert.equal(read.servers[0].name, 'github');
  assert.equal(read.servers[0].url, 'https://api.githubcopilot.com/mcp/');
  assert.equal(read.servers[0].state, null, 'no harness here to ask, so the state is unread — which is not an absence');
  assert.ok(read.unread, "and the read says why in the runtime's words");
});

test("REFUSED: an Authorization header, a local server, a name that is no server's and a name that is no factory's", async () => {
  assert.match(
    await refused(
      () => send('PUT', `${URL}/github`, { url: 'https://api.githubcopilot.com/mcp/', header: ['Authorization=Bearer x'] }),
      422,
    ),
    /`Authorization` is a credential, and a factory's record is a plain file/,
  );
  assert.match(
    await refused(() => send('PUT', `${URL}/Nope!`, { url: 'https://e.example/mcp' }), 400),
    /PUT \/api\/factories\/mcpmill\/servers\/Nope!: `Nope!` is not a server's name/,
  );
  assert.match(
    await refused(() => send('PUT', '/api/factories/Nope!/servers/github', { url: 'https://e.example/mcp' }), 400),
    /is not a factory's name/,
  );
  assert.match(await refused(() => send('PUT', `${URL}/local`, { url: 'not-an-address' }), 422), /`url` is the address it is reached at/);
  assert.match(await refused(() => app.request('/api/factories/Nope!/servers'), 400), /is not a factory's name/);
  assert.match(await refused(() => app.request('/api/factories/nosuch/servers'), 404), /nosuch/);
});

test('a server removed leaves the record, and one the factory does not record is 404', async () => {
  assert.match(await refused(() => send('DELETE', `${URL}/nosuch`, {}), 404), /records no server `nosuch`/);
  await answered(send('DELETE', `${URL}/github`, {}));
  assert.equal(held(), null, 'the last server gone, the file is removed rather than left empty');
  assert.deepEqual((await answered<FactoryServersRead>(app.request(URL))).servers, []);
});

test('the shipped list tolerates a folder that is not there at all, and leaves out a file that does not read', () => {
  assert.deepEqual(shippedServers(path.join(root, 'no-such-folder')), [], 'git commits no empty directory, so it may be absent');
  const dir = scratch('nemia-api-shipped-');
  fs.writeFileSync(path.join(dir, 'github.json'), JSON.stringify({ type: 'http', url: 'https://api.githubcopilot.com/mcp/' }));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{');
  fs.writeFileSync(path.join(dir, 'noturl.json'), JSON.stringify({ type: 'http' }));
  fs.writeFileSync(path.join(dir, 'Nope!.json'), JSON.stringify({ type: 'http', url: 'https://e.example/mcp' }));
  fs.writeFileSync(path.join(dir, 'README.md'), 'not a server');
  assert.deepEqual(shippedServers(dir), [{ name: 'github', type: 'http', url: 'https://api.githubcopilot.com/mcp/' }]);
  assert.ok(SHIPPED_SERVERS.endsWith(path.join('workflows', 'servers')), 'read beside workflows/skills, of the checkout the api runs from');
});
