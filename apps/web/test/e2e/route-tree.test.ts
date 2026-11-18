/**
 * The stories' Vitest writes no route tree: with a route file added under `src/routes`, `npm run stories` run on one story file leaves
 * `src/routeTree.gen.ts` byte for byte as it was, the router's plugin being left out of its config as Storybook's is
 * (`.storybook/router.ts`); the board's build alone writes the tree. The route file is taken back however the test ends,
 * but not when its process is killed (for memory, say): then `src/routes/zz-route-tree-probe.tsx` is left in the workspace, which a
 * step's run would commit: delete it. `npm run e2e -- --look` runs this, and a whole `npm run e2e` first; it launches Chromium,
 * through Vitest.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WAITED } from '../waits.ts';
import { WEB } from './world.ts';

/** The route tree the router's plugin writes, and a route file it would add to it. */
const TREE = path.join(WEB, 'src', 'routeTree.gen.ts');
const PROBE = path.join(WEB, 'src', 'routes', 'zz-route-tree-probe.tsx');

/** A route file as the board writes one, which the router's plugin would add to the tree. */
const ROUTE = `import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/zz-route-tree-probe')({ component: () => null });
`;

test('npm run stories, with a route file added, leaves src/routeTree.gen.ts unwritten', WAITED, () => {
  const before = fs.readFileSync(TREE);
  fs.writeFileSync(PROBE, ROUTE);
  try {
    const ran = spawnSync('npm', ['run', 'stories', '--', 'src/components/look/Plate.stories.tsx'], {
      cwd: WEB,
      encoding: 'utf8',
      timeout: WAITED.timeout - 10_000,
    });
    assert.equal(ran.status, 0, `the stories ran: ${(ran.stdout + ran.stderr).trim().split('\n').slice(-12).join('\n')}`);
    assert.ok(fs.readFileSync(TREE).equals(before), 'the route tree is as it was: the stories wrote no route of the probe into it');
  } finally {
    fs.rmSync(PROBE, { force: true });
    if (!fs.readFileSync(TREE).equals(before)) fs.writeFileSync(TREE, before);
  }
});
