/**
 * The store's library as a factory reads it, on the tests' team planted as the store's library: an unrecorded factory's adds derived from
 * what its steps run, the first add writing the record whole, a missing add and its state, and who uses an item.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { TEAM } from '../../test/team.ts';
import { addedServers, factoryAdds, libraryAddObject, libraryUsers, writeLibraryAdd } from './library.verb.ts';
import { libraryAddsFile, readLibraryAdds, writeLibraryAdds, writeLibraryServers } from './library.store.ts';

/** A store whose library is a copy of the tests' team. */
const store = (): string => {
  const home = scratch('wf-library-');
  fs.cpSync(TEAM, path.join(home, 'workflows'), { recursive: true });
  return home;
};

test("a factory's adds: derived while unrecorded, written whole by its first add, and each add's state", async (t) => {
  const home = store();
  await t.test('unrecorded, the default factory has every library agent its steps run and the skills they give', () => {
    const { recorded, adds } = factoryAdds(home, 'default');
    assert.equal(recorded, false);
    for (const name of ['implementer', 'reviewer', 'shipper']) assert.ok(adds.some((a) => a.kind === 'Agent' && a.name === name), name);
    assert.ok(adds.some((a) => a.kind === 'Skill' && a.name === 'implement-a-change'));
    assert.equal(fs.existsSync(libraryAddsFile(home, 'default')), false, 'a read writes nothing');
  });
  await t.test('REFUSED: an add of a name the library does not hold, and nothing is written', () => {
    assert.throws(() => writeLibraryAdd(home, 'default', 'add', { kind: 'Agent', name: 'nobody' }), { _tag: 'Missing' });
    assert.equal(readLibraryAdds(home, 'default'), undefined);
  });
  await t.test('the first add writes what was derived and the new one', () => {
    const derived = factoryAdds(home, 'default').adds;
    const added = writeLibraryAdd(home, 'default', 'add', { kind: 'Skill', name: 'create-an-agent' });
    assert.equal(added.status.state, 'resolved');
    assert.equal(added.status.origin, 'builtin');
    assert.deepEqual(readLibraryAdds(home, 'default'), [...derived, { kind: 'Skill', name: 'create-an-agent' }]);
  });
  await t.test('an add the library no longer holds is missing, and can still be taken off', () => {
    fs.rmSync(path.join(home, 'workflows', 'agents', 'shipper.md'));
    const shipper = { kind: 'Agent', name: 'shipper' } as const;
    assert.equal(libraryAddObject(home, 'default', shipper, true).status.state, 'missing');
    writeLibraryAdd(home, 'default', 'remove', shipper);
    assert.throws(() => writeLibraryAdd(home, 'default', 'remove', shipper), { _tag: 'Missing' });
  });
});

test('who uses a library item: each factory whose adds hold it, recorded or derived', () => {
  const home = store();
  assert.deepEqual(libraryUsers(home, { kind: 'Agent', name: 'implementer' }), ['default']);
  writeLibraryAdds(home, 'default', []);
  assert.deepEqual(libraryUsers(home, { kind: 'Agent', name: 'implementer' }), [], 'a record without it');
});

test("library.json reads as undefined where absent, keeps a newer tick's keys, and refuses a broken file naming it", () => {
  const home = scratch('wf-library-file-');
  assert.equal(readLibraryAdds(home, 'default'), undefined);
  const file = libraryAddsFile(home, 'acme');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ adds: [{ kind: 'Skill', name: 'tidy' }], later: 1 }));
  writeLibraryAdds(home, 'acme', [{ kind: 'Agent', name: 'scribe' }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { later: 1, adds: [{ kind: 'Agent', name: 'scribe' }] });
  fs.writeFileSync(file, JSON.stringify({ adds: [{ kind: 'Workflow', name: 'x' }] }));
  assert.throws(() => readLibraryAdds(home, 'acme'), { _tag: 'Invalid' });
});

test("a factory's added library servers: the person's record of each, else Nemia's builtin, and none while it is unrecorded", () => {
  const home = scratch('wf-library-servers-');
  writeLibraryServers(home, { notes: { type: 'http', url: 'https://notes.example/mcp' } });
  assert.deepEqual(addedServers(home, 'acme'), {}, 'unrecorded');
  writeLibraryAdds(home, 'acme', [
    { kind: 'McpServer', name: 'notes' },
    { kind: 'McpServer', name: 'github' },
    { kind: 'McpServer', name: 'gone' },
  ]);
  const servers = addedServers(home, 'acme');
  assert.deepEqual(servers.notes, { type: 'http', url: 'https://notes.example/mcp' });
  assert.equal(typeof servers.github?.url, 'string', "Nemia's builtin github, by name");
  assert.equal(servers.gone, undefined, 'an add the library no longer holds hands nothing to a run');
});
