/**
 * A factory's MCP server record: what it refuses, what its store keeps, and how an agent's `mcp:` names split against it.
 *
 * The two refusals the card rests on are each proven by the fixture that would pass without them: an `Authorization` header, against
 * the same entry with a toolset header, which is kept; and a local server, against the same entry given a `url`. And the split's
 * precedence is proven by a name that is on both the record and the checkout's list, which must leave `projectMcp` altogether.
 *
 * The store takes its root as a required `home: string`, so every call here names this file's own scratch root and nothing reads the
 * person's: that is what `test/root-given.test.ts` holds for the whole package, and this file is the fixture that shows it.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { storeGiven } from '../../../test/config-given.ts';
import { DEFAULT_NAMESPACE } from '../factory.ts';
import { factoryServerRefusal, factoryServersRefusal, serverNameRefusal, splitServers } from './servers.ts';
import { builtinServers } from './servers.store.ts';
import { factoryText, plantKey, readFactoryServers, recordText, writeFactoryServers } from '../../../testing.ts';
import { serversKey } from '../door/factory-keys.ts';
import { Effect } from 'effect';
import { HEADER_MASK } from 'objects';
import { FACTORY_SERVER_ADD, listedOf } from './servers.verb.ts';
import type { Env } from '../../config/config.store.ts';

const ROOT = scratch('wf-servers-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };

/** The hosted GitHub server as a factory records it: a toolset header, and the facts of an OAuth client with no secret. */
const GITHUB = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  headers: { 'X-MCP-Toolsets': 'actions,repos' },
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
} as const;

test("a factory's server record round-trips, and one with no server is removed rather than left empty", () => {
  assert.equal(recordText(ROOT, serversKey('pipao')), undefined, 'none written');
  assert.deepEqual(readFactoryServers(ROOT, 'pipao'), {}, 'and a reader that only reads takes an empty record');
  writeFactoryServers(ROOT, 'pipao', { github: GITHUB });
  assert.deepEqual(readFactoryServers(ROOT, 'pipao'), { github: GITHUB });
  writeFactoryServers(ROOT, 'pipao', {});
  assert.equal(recordText(ROOT, serversKey('pipao')), undefined, 'removed, so a re-read finds none rather than an empty map');
});

test('the store writes under the root it is given and no other: two roots, one factory name, two records', () => {
  const other = scratch('wf-servers-other-');
  writeFactoryServers(ROOT, 'twice', { github: GITHUB });
  writeFactoryServers(other, 'twice', { docs: { type: 'sse', url: 'https://docs.example/mcp' } });
  assert.deepEqual(Object.keys(readFactoryServers(ROOT, 'twice')), ['github'], "the first root's record");
  assert.deepEqual(Object.keys(readFactoryServers(other, 'twice')), ['docs'], "and the second root's, written beside it and not over it");
  writeFactoryServers(ROOT, 'twice', {});
  writeFactoryServers(other, 'twice', {});
});

test('the servers Nemia ships: an absent folder is none, a file that does not read is left out, and the rest are offered', () => {
  const dir = path.join(scratch('wf-shipped-'), 'servers');
  assert.deepEqual(builtinServers(dir), [], 'git commits no empty directory, so an absent folder is no error');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'github.json'), JSON.stringify(GITHUB));
  fs.writeFileSync(path.join(dir, 'broken.json'), 'not json');
  fs.writeFileSync(path.join(dir, 'local.json'), JSON.stringify({ command: 'npx' }));
  fs.writeFileSync(path.join(dir, 'two words.json'), JSON.stringify(GITHUB));
  fs.writeFileSync(path.join(dir, 'notes.md'), 'read me');
  assert.deepEqual(
    builtinServers(dir),
    [{ name: 'github', ...GITHUB }],
    'one bad shipped file blanks no form: the broken, the local and the ill-named are left out',
  );
});

test('a record a newer tick wrote keeps the keys this one does not name — beside a server, and beside the servers — through a write', () => {
  plantKey(
    ROOT,
    serversKey('later'),
    JSON.stringify({ servers: { github: { ...GITHUB, mood: 'bright' } }, checked: '2026-10-21T00:00:00.000Z' }),
  );
  const read = readFactoryServers(ROOT, 'later');
  assert.equal((read.github as unknown as { mood: string }).mood, 'bright', 'a Struct would strip it; a StructWithRest keeps it');
  const kept = () => JSON.parse(recordText(ROOT, serversKey('later')) ?? '{}') as { checked?: string; servers: Record<string, unknown> };
  assert.equal(kept().checked, '2026-10-21T00:00:00.000Z', 'and the key beside the servers is read too, not only the one inside one');

  writeFactoryServers(ROOT, 'later', { ...read, docs: { type: 'sse', url: 'https://docs.example/mcp' } });
  assert.equal(
    kept().checked,
    '2026-10-21T00:00:00.000Z',
    'a newer tick downgrades to this one and adds a server: what it wrote beside the servers is still there, which is what the rest is for',
  );
  assert.equal((kept().servers.github as { mood: string }).mood, 'bright', 'and so is the key beside that server');
  assert.deepEqual(Object.keys(kept().servers), ['github', 'docs'], 'with the server the write added');

  writeFactoryServers(ROOT, 'later', {});
  assert.equal(
    recordText(ROOT, serversKey('later')),
    undefined,
    'the last server gone, the record goes whole: no stamp of a record that is not there',
  );
});

test('REFUSED: a server record that does not read, naming the record, its wrong field and the command that writes it again', () => {
  plantKey(ROOT, serversKey('broken'), 'not json');
  assert.throws(
    () => readFactoryServers(ROOT, 'broken'),
    (e: Error) => {
      assert.ok(e.message.includes(serversKey('broken')));
      assert.match(e.message, /nemia factory server add broken <server> --url <address>/);
      return true;
    },
  );
  plantKey(ROOT, serversKey('broken'), JSON.stringify({ servers: { github: { type: 'ftp', url: 'x' } } }));
  assert.throws(
    () => readFactoryServers(ROOT, 'broken'),
    (e: Error) => {
      assert.match(e.message, /its servers\.github\.type /, 'the first wrong field, named');
      assert.match(e.message, /add the server again with nemia factory server add broken/, 'and the command to type');
      return true;
    },
  );
});

test('the default factory is given a record of its own, and no factory record is written for it', () => {
  writeFactoryServers(ROOT, DEFAULT_NAMESPACE, { github: GITHUB });
  assert.deepEqual(readFactoryServers(ROOT, DEFAULT_NAMESPACE), { github: GITHUB }, 'every run and card that names no factory runs in it');
  assert.equal(factoryText(ROOT, DEFAULT_NAMESPACE), undefined, 'the default factory is still no record');
});

test('REFUSED: an Authorization header, by name — and the same entry with a toolset header is kept', () => {
  const refused = factoryServerRefusal({ ...GITHUB, headers: { Authorization: 'Bearer ghp_x' } });
  assert.match(refused!, /`Authorization` is a credential/);
  assert.match(refused!, /a factory's record is a plain file/);
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
  assert.match(refused!, /A factory records a remote server alone/);
  assert.match(refused!, /this one has a `command`/);
  assert.match(refused!, /Declare it in the checkout's `\.mcp\.json`/, 'the road for one');
  assert.match(refused!, /name it on the agent's `mcp:` line/);

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

test('the split gives the factory precedence: a name it records leaves projectMcp altogether', () => {
  const record = { github: GITHUB };
  assert.deepEqual(
    splitServers(['github', 'repo'], record),
    { mcp: { github: GITHUB }, checkout: ['repo'] },
    "the factory's server rides the task's own mcp; the rest stay the checkout's",
  );
  assert.deepEqual(
    splitServers(['github'], record).checkout,
    [],
    'and the name is NOT left on projectMcp too: both lists would trip the runtime\'s "one would hide the other" refusal and refuse the step',
  );
  assert.deepEqual(splitServers(['repo', 'docs'], record), { checkout: ['repo', 'docs'] }, 'a name it does not record resolves as it did');
  assert.deepEqual(splitServers(['repo'], undefined), { checkout: ['repo'] }, 'a factory with no record changes nothing');
  assert.deepEqual(splitServers([], record), { checkout: [] });
  assert.deepEqual(splitServers(undefined, record), { checkout: [] }, 'an agent frozen before it named any still loads the whole file');
});

describe("a server's headers are served masked, and a mask sent back keeps the value the record holds", () => {
  let root!: string;
  beforeAll(() => {
    root = scratch('wf-servers-mask-');
  });
  const add = async (server: string, ...headers: string[]) => {
    const sent = Object.fromEntries(headers.map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
    const program = storeGiven(
      root,
      ENV,
    )(
      FACTORY_SERVER_ADD.handler({ factory: DEFAULT_NAMESPACE, server, url: 'https://docs.example/mcp', headers: sent }),
    ) as unknown as Effect.Effect<{ server: { headers?: Record<string, string> } }, { _tag?: string }>;
    return Effect.runPromise(program).then(
      (answer) => answer,
      (err: { _tag?: string }) => ({ refused: err._tag }),
    );
  };
  const stored = () => readFactoryServers(root, DEFAULT_NAMESPACE);
  test('a read masks every value', () => {
    assert.deepEqual(
      listedOf('docs', { type: 'http', url: 'https://docs.example/mcp', headers: { 'X-Key': 'secret' } }, undefined).headers,
      {
        'X-Key': HEADER_MASK,
      },
    );
  });
  test('an add answers the server masked, and writes the values sent', async () => {
    const answer = await add('docs', 'X-Key=secret', 'X-Toolsets=repos');
    assert.deepEqual('server' in answer && answer.server.headers, { 'X-Key': HEADER_MASK, 'X-Toolsets': HEADER_MASK });
    assert.deepEqual(stored().docs?.headers, { 'X-Key': 'secret', 'X-Toolsets': 'repos' });
  });
  test('a mask sent for a stored header keeps the stored value on disk, beside a value sent anew', async () => {
    await add('docs', `X-Key=${HEADER_MASK}`, 'X-Toolsets=actions');
    assert.deepEqual(stored().docs?.headers, { 'X-Key': 'secret', 'X-Toolsets': 'actions' });
  });
  test('REFUSED Invalid: a mask sent for a header the server holds no value of, and nothing is written', async () => {
    const before = recordText(root, serversKey(DEFAULT_NAMESPACE));
    assert.deepEqual(await add('docs', 'X-Key=fresh', `X-New=${HEADER_MASK}`), { refused: 'Invalid' });
    assert.deepEqual(await add('other', `X-Key=${HEADER_MASK}`), { refused: 'Invalid' });
    assert.equal(recordText(root, serversKey(DEFAULT_NAMESPACE)), before);
  });
});
