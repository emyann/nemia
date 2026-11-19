/**
 * The MCP servers a run is handed (`recordedServers`, `told.verb.ts`): the factory's own record beside the library servers it has added,
 * its own winning a name they share.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { recordedServers } from './told.verb.ts';
import { writeFactoryServers } from '../factory/servers/servers.store.ts';
import { writeLibraryAdds, writeLibraryServers } from '../library/library.store.ts';
import { DEFAULT_NAMESPACE } from '../factory/factory.ts';

test("a run's servers: the factory's own beside the library's it added, its own winning a clashing name", () => {
  const home = scratch('wf-told-servers-');
  writeLibraryServers(home, {
    notes: { type: 'http', url: 'https://notes.library.example/mcp' },
    search: { type: 'http', url: 'https://search.library.example/mcp' },
  });
  writeLibraryAdds(home, DEFAULT_NAMESPACE, [
    { kind: 'McpServer', name: 'notes' },
    { kind: 'McpServer', name: 'search' },
  ]);
  writeFactoryServers(home, DEFAULT_NAMESPACE, { search: { type: 'http', url: 'https://search.own.example/mcp' } });
  const servers = recordedServers(undefined, home);
  assert.deepEqual(Object.keys(servers).sort(), ['notes', 'search']);
  assert.equal(servers.notes?.url, 'https://notes.library.example/mcp', 'an added library server is handed to the run');
  assert.equal(servers.search?.url, 'https://search.own.example/mcp', "the factory's own wins the name");
});
