/** `GET /api/store` (yours.ts): your store's folders under the root of the app asked, and the line that files a factory, off the table. */
import '../../test/harness.ts';
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Layer } from 'effect';
import { COMMANDS, commandLine } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { app, appOf, liveOf } from '../app.ts';
import { StoreRoot } from '../store.ts';
import type { YourStore } from './yours.ts';

/** `GET /api/store`, asked through `on`. */
const storeOn = async (on: typeof app): Promise<YourStore> => {
  const res = await on.request('/api/store');
  assert.equal(res.status, 200);
  return (await res.json()) as YourStore;
};

test("GET /api/store answers your folders under the app's store root, each absolute, and the table's line that files a factory", async () => {
  const fileFactory = commandLine(
    COMMANDS.find((c) => c.name === 'factory add')!,
    {},
    { repos: '<path>' },
  );
  assert.equal(fileFactory, 'nemia factory add <name> --repo <path>');
  assert.deepEqual(await storeOn(app), {
    workflows: path.join(root, 'workflows'),
    agents: path.join(root, 'workflows', 'agents'),
    skills: path.join(root, 'workflows', 'skills'),
    fileFactory,
  });
  const home = scratch('nemia-api-yours-home-');
  const { app: own } = appOf(Layer.merge(liveOf(), Layer.succeed(StoreRoot)(home)));
  assert.deepEqual(
    await storeOn(own),
    {
      workflows: path.join(home, 'workflows'),
      agents: path.join(home, 'workflows', 'agents'),
      skills: path.join(home, 'workflows', 'skills'),
      fileFactory,
    },
    "an app over another root answers that root, not the package's HOME",
  );
});
