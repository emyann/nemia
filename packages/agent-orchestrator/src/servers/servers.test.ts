/**
 * A factory's MCP server record: what it refuses, what its store keeps, and how an agent's `mcp:` names split against it.
 *
 * The two refusals the card rests on are each proven by the fixture that would pass without them: an `Authorization` header, against
 * the same entry with a toolset header, which is kept; and a local server, against the same entry given a `url`. And the split's
 * precedence is proven by a name that is on both the record and the checkout's list, which must leave `checkoutMcp` altogether.
 *
 * A store of its own, since `WF_ROOT` is read as the module loads: every part of the package is imported dynamically, after it is set,
 * or a file that ran first in the same process would have fixed the store's root already.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-servers-');
process.env.WF_ROOT = ROOT;
const { DEFAULT_FACTORY } = await import('../factory/factory.ts');
const { factoryServerRefusal, factoryServersRefusal, serverNameRefusal, splitServers } = await import('./servers.ts');
const { factoryServers, factoryServersFile, readFactoryServers, writeFactoryServers } = await import('./servers.store.ts');

/** The hosted GitHub server as a factory records it: a toolset header, and the facts of an OAuth client with no secret. */
const GITHUB = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  headers: { 'X-MCP-Toolsets': 'actions,repos' },
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
} as const;

test("a factory's server record round-trips, and one with no server is removed rather than left empty", () => {
  assert.equal(readFactoryServers('pipao'), undefined, 'none written');
  assert.deepEqual(factoryServers('pipao'), {}, 'and a reader that only reads takes an empty record');
  writeFactoryServers('pipao', { github: GITHUB });
  assert.equal(factoryServersFile('pipao'), path.join(ROOT, 'factories', 'pipao', 'servers.json'));
  assert.deepEqual(readFactoryServers('pipao'), { servers: { github: GITHUB } });
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'factories', 'pipao')), ['servers.json'], 'no hidden file left');
  writeFactoryServers('pipao', {});
  assert.equal(fs.existsSync(factoryServersFile('pipao')), false, 'removed, so a re-read finds none rather than an empty map');
});

test('a record a newer tick wrote keeps the keys this one does not name, server by server', () => {
  const file = path.join(ROOT, 'factories', 'later', 'servers.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ servers: { github: { ...GITHUB, mood: 'bright' } }, checked: '2026-10-21T00:00:00.000Z' }));
  const read = readFactoryServers('later');
  assert.equal((read!.servers.github as unknown as { mood: string }).mood, 'bright', 'a Struct would strip it; a StructWithRest keeps it');
});

test('REFUSED: a server record that does not read, naming the file, its wrong field and the command that writes it again', () => {
  const file = path.join(ROOT, 'factories', 'broken', 'servers.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not json');
  assert.throws(
    () => readFactoryServers('broken'),
    (e: Error) => {
      assert.match(e.message, /is not JSON: add the server again with nemia factory server add broken <server> --url <address>\./);
      return true;
    },
  );
  fs.writeFileSync(file, JSON.stringify({ servers: { github: { type: 'ftp', url: 'x' } } }));
  assert.throws(
    () => readFactoryServers('broken'),
    (e: Error) => {
      assert.match(e.message, /servers\.json: its servers\.github\.type /, 'the first wrong field, named');
      assert.match(e.message, /add the server again with nemia factory server add broken/, 'and the command to type');
      return true;
    },
  );
  assert.throws(() => factoryServersFile('Nope!'), /is not a factory's name/);
});

test('the default factory is given a record of its own, while factories/default.json is never written', () => {
  writeFactoryServers(DEFAULT_FACTORY, { github: GITHUB });
  assert.deepEqual(factoryServers(DEFAULT_FACTORY), { github: GITHUB }, 'every run and card that names no factory runs in it');
  assert.equal(factoryServersFile(DEFAULT_FACTORY), path.join(ROOT, 'factories', 'default', 'servers.json'));
  assert.equal(fs.existsSync(path.join(ROOT, 'factories', 'default.json')), false, 'the default factory is still no file');
});

test('REFUSED: an Authorization header, by name — and the same entry with a toolset header is kept', () => {
  const refused = factoryServerRefusal({ ...GITHUB, headers: { Authorization: 'Bearer ghp_x' } });
  assert.match(refused!, /`Authorization` is a credential, and a factory's record is a plain file/);
  assert.match(refused!, /A factory's server signs in instead/, 'and the sentence names the road');
  assert.match(
    factoryServerRefusal({ ...GITHUB, headers: { authorization: 'Bearer ghp_x' } })!,
    /`authorization` is a credential/,
    'refused however it is cased: a header name is case-insensitive on the wire',
  );
  assert.equal(factoryServerRefusal(GITHUB), undefined, 'the same entry with a toolset header is kept — the next card needs it');
});

test('REFUSED: a local server, and the same entry given a url is kept', () => {
  const refused = factoryServerRefusal({ command: 'npx', args: ['-y', '@playwright/mcp'] });
  assert.match(refused!, /A factory records a remote server alone, and this one has a `command`/);
  assert.match(refused!, /Declare it in the checkout's `\.mcp\.json` and name it on the agent's `mcp:` line/, 'the road for one');
  assert.equal(factoryServerRefusal({ type: 'http', url: 'https://e.example/mcp' }), undefined);
});

test("REFUSED: a url that is no address, a transport the harness loads nothing from, headers that are not strings, and a name that is no server's", () => {
  assert.match(factoryServerRefusal({ type: 'http', url: 'api.githubcopilot.com' })!, /`url` is the address it is reached at/);
  assert.match(factoryServerRefusal({ type: 'http', url: '' })!, /`url` is the address it is reached at/);
  assert.match(factoryServerRefusal({ url: 'https://e.example/mcp' })!, /transport is "http" or "sse".*Give "type": "http"/s);
  assert.match(factoryServerRefusal({ type: 'stdio', url: 'https://e.example/mcp' })!, /transport is "http" or "sse"/);
  assert.match(factoryServerRefusal({ type: 'http', url: 'https://e.example/mcp', headers: { X: 1 } })!, /`headers` are strings by name/);
  assert.match(factoryServerRefusal('github')!, /A server is \{ "type": "http"/);
  assert.match(serverNameRefusal('two words')!, /is not a server's name: letters, digits, - and _/);
  assert.match(serverNameRefusal('')!, /A server is named, and this name is empty/);
  assert.equal(serverNameRefusal('local_docs'), undefined);
  assert.match(factoryServersRefusal({ github: GITHUB, 'two words': GITHUB })!, /`two words`: .*is not a server's name/);
  assert.equal(factoryServersRefusal({ github: GITHUB }), undefined);
});

test('the split gives the factory precedence: a name it records leaves checkoutMcp altogether', () => {
  const record = { github: GITHUB };
  assert.deepEqual(
    splitServers(['github', 'repo'], record),
    { mcp: { github: GITHUB }, checkout: ['repo'] },
    "the factory's server rides the task's own mcp; the rest stay the checkout's",
  );
  assert.deepEqual(
    splitServers(['github'], record).checkout,
    [],
    'and the name is NOT left on checkoutMcp too: both lists would trip the runtime\'s "one would hide the other" refusal and refuse the step',
  );
  assert.deepEqual(splitServers(['repo', 'docs'], record), { checkout: ['repo', 'docs'] }, 'a name it does not record resolves as it did');
  assert.deepEqual(splitServers(['repo'], undefined), { checkout: ['repo'] }, 'a factory with no record changes nothing');
  assert.deepEqual(splitServers([], record), { checkout: [] });
  assert.deepEqual(splitServers(undefined, record), { checkout: [] }, 'an agent frozen before it named any still loads the whole file');
});
