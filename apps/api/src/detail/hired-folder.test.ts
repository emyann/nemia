/**
 * A run's page of a run started in a factory (`GET /api/runs/:id`): its workflow folder is read with the factory's hires, as its start
 * read it, so a step the factory hires an agent into, whose file adds `skills:` to that agent, raises no warning; and the same folder
 * truly broken after the start still warns, in the folder's words, said once, with one full stop.
 *
 * The factory `hires` holds `repo`, attaches `build` and hires `seldon` into `build/design`, whose file names no agent.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import type { RunDetail } from './detail.ts';
import { app } from '../app.ts';
import { addFactory, attachWorkflow, hireAgent } from 'agent-orchestrator';

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const repo = scratch('nemia-api-hired-folder-');
const folder = path.join(repo, 'workflows', 'build');
write(path.join(folder, 'design.md'), '---\nplace: git\nskills: spec-it\n---\nDesign it.\n');
write(path.join(repo, 'workflows', 'agents', 'seldon.md'), '---\nharness: claude\n---\nYou design.\n');
write(path.join(repo, 'workflows', 'skills', 'spec-it', 'SKILL.md'), '---\nname: spec-it\ndescription: Write a spec.\n---\nSpec it.\n');
addFactory({ name: 'hires', repos: [repo] });
attachWorkflow({ factory: 'hires', workflow: 'build' });
hireAgent({ factory: 'hires', agent: 'seldon', step: 'build/design' });

const R = 'r-hired';
write(
  path.join(root, 'runs', `${R}.json`),
  JSON.stringify({
    id: R,
    repo,
    workspace: repo,
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Design it',
    workflowDir: folder,
    factory: 'hires',
    createdAt: '2026-10-12T06:00:00.000Z',
    workflow: [{ name: 'design', after: [], body: 'Design it.', harness: 'claude' }],
    steps: { design: { taskId: null } },
  }),
);

const detailOf = async (): Promise<RunDetail> => {
  const res = await app.request(`/api/runs/${R}`);
  const body = (await res.json()) as RunDetail;
  assert.equal(res.status, 200, JSON.stringify(body));
  return body;
};

test('a run of a factory that hires an agent into a step whose file adds `skills:` carries no warning: its folder reads with the hires', async () => {
  assert.equal((await detailOf()).warning, null);
});

test('REFUSED: the same folder truly broken after the start warns in the same words, with one full stop', async () => {
  write(path.join(folder, 'design.md'), '---\nplace: git\nskills: spec-it\nsomeNewerKey: 1\n---\nDesign it.\n');
  const { warning } = await detailOf();
  assert.ok(warning);
  assert.ok(
    warning.startsWith(`The workflow folder ${folder} no longer reads as a workflow: design: \`someNewerKey\` is not a key a step has.`),
  );
  assert.match(warning, /nobody enforces\. Nothing here is read from it: .*the workflow the run froze at `nemia start`/);
  assert.ok(!warning.includes('..'), warning);
});
