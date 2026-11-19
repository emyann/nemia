/**
 * Where a harness keeps its user's own agent files (`userAgentFolders`): Claude Code's under its config folder when one is set, else
 * under the home's.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { userAgentFolders } from '../src/index.ts';

test("a harness's folder of its user's own agents: under its config folder when one is set, else under the home's", () => {
  assert.deepEqual(userAgentFolders({ CLAUDE_CONFIG_DIR: '/srv/claude' }), [
    { harness: 'claude', folder: path.join('/srv/claude', 'agents') },
  ]);
  assert.deepEqual(userAgentFolders({}), [{ harness: 'claude', folder: path.join(os.homedir(), '.claude', 'agents') }]);
  assert.deepEqual(userAgentFolders({ CLAUDE_CONFIG_DIR: '' }), userAgentFolders({}), 'an empty one is none');
});
