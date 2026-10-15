/**
 * A picture a step's browser wrote into its files directory, named in its closeout by its absolute path there, is one the board links
 * and draws; the same picture named under `/tmp/playwright-mcp`, where a step's browser wrote before, is its path alone.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactsDir } from 'agent-orchestrator';
import { artifactOf } from './artifacts.ts';

test('a picture in the step files directory reads with its url and as an image; one under /tmp/playwright-mcp, by its path alone', () => {
  const run = { id: 'r-pictures' };
  const dir = artifactsDir(run, 'design');
  fs.mkdirSync(dir, { recursive: true });
  const picture = path.join(dir, 'page-1.png');
  fs.writeFileSync(picture, 'png');
  assert.deepEqual(artifactOf(run, 'design', picture), {
    path: picture,
    name: 'page-1.png',
    url: '/api/runs/r-pictures/steps/design/artifacts/page-1.png',
    kind: 'image',
    size: 3,
  });
  assert.deepEqual(artifactOf(run, 'design', '/tmp/playwright-mcp/page-1.png'), { path: '/tmp/playwright-mcp/page-1.png' });
});
