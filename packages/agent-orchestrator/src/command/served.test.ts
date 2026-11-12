/**
 * The table's left-out list: the entries the command line serves alone that link no endpoint of the api, so no tool of the port calls
 * them. A new one, or one the api comes to serve, is a change this list is edited for, never one that passes unseen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLE } from './commands.verb.ts';

/** Each entry of the command line's alone that no endpoint serves, in the table's order. */
const LEFT_OUT = [
  'template lint',
  'template export',
  'template pack',
  'template unpack',
  'service install',
  'service uninstall',
  'service status',
  'service restart',
  'service addresses',
  'doctor carry',
  'readiness',
  'token add',
  'token ls',
  'token rm',
  'claude-token set',
  'claude-token status',
  'claude-token rm',
  'upgrade',
  'version',
  'frontmatter rewrite',
  'tick',
  'up',
  'admit',
];

test('the entries the command line serves alone and no endpoint links are the left-out list, each saying why', () => {
  const left = TABLE.filter((c) => c.only?.side === 'cli' && c.served === undefined);
  assert.deepEqual(
    left.map((c) => c.name),
    LEFT_OUT,
  );
  assert.deepEqual(
    left.filter((c) => !c.only?.why.trim()).map((c) => c.name),
    [],
  );
});
