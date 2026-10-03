/**
 * What a step was told, by layer, as the run page reads it (`GET /api/runs/:id`, `layers`): each layer from what the run froze at
 * `wf start` — the agent's instructions and skills, the person's custom instructions, the step's note and the skill its line adds, and the
 * task — never from the agent's, the custom instructions' or the step's file as it is now; and none for a record that froze no workflow.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDetail } from '../src/detail/detail.ts';
import { app } from '../src/app.ts';
import { start } from 'agent-orchestrator';

const WORKFLOWS = path.join(root, 'workflows');
const AGENT = path.join(WORKFLOWS, 'agents', 'layered.md');
const CUSTOM = path.join(root, 'custom-instructions', 'layered.md');
const TEAM = path.join(WORKFLOWS, 'layers');
const STEP = path.join(TEAM, 'write.md');

for (const skill of ['alpha', 'gamma']) {
  fs.mkdirSync(path.join(WORKFLOWS, 'skills', skill), { recursive: true });
  fs.writeFileSync(
    path.join(WORKFLOWS, 'skills', skill, 'SKILL.md'),
    `---\nname: ${skill}\ndescription: Use this to ${skill}.\n---\n${skill}.\n`,
  );
}
fs.mkdirSync(path.dirname(AGENT), { recursive: true });
fs.writeFileSync(AGENT, '---\ndescription: Use this to write.\nskills: alpha\n---\nYou are the writer.\n');
fs.mkdirSync(path.dirname(CUSTOM), { recursive: true });
fs.writeFileSync(CUSTOM, 'Be terse.\n');
fs.mkdirSync(TEAM, { recursive: true });
fs.writeFileSync(STEP, '---\nworkspace: folder\nagent: layered\nskills: alpha, gamma\n---\nWrite the note.\n');

/** The run `id` in full, as the board reads it. */
const detailOf = async (id: string): Promise<RunDetail> => {
  const res = await app.request(`/api/runs/${id}`);
  assert.equal(res.status, 200);
  return (await res.json()) as RunDetail;
};

test('each layer is answered as the run froze it: an edit of the agent, its custom instructions or the step since reaches none', async () => {
  const run = start({ brief: 'Write a note.', repo: '', workflowDir: TEAM });
  fs.writeFileSync(AGENT, '---\ndescription: Use this to write.\n---\nYou are someone else now.\n');
  fs.writeFileSync(CUSTOM, 'Be verbose.\n');
  fs.writeFileSync(STEP, '---\nworkspace: folder\nagent: layered\n---\nWrite an essay.\n');
  const [write] = (await detailOf(run.id)).steps;
  assert.deepEqual(write.layers && { ...write.layers, task: undefined }, {
    agent: 'layered',
    instructions: 'You are the writer.',
    custom: 'Be terse.',
    agentSkills: ['alpha'],
    policy: 'Write the note.',
    addedSkills: ['gamma'],
    task: undefined,
    via: 'prompt',
  });
  assert.ok(write.told?.startsWith('Write the note.\n\n## What was asked for'), write.told ?? 'null');
  assert.equal(
    write.layers?.task,
    write.told?.slice('Write the note.\n\n'.length),
    "a step not filed: the task is its preview's, after the note",
  );
});

test('a record that froze no workflow answers no layers, and still what it was told', async () => {
  const id = 'layers-unfrozen';
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      place: { kind: 'folder' },
      workspace: path.join(root, 'runs', id, 'work'),
      brief: 'Write a note.',
      createdAt: '2026-10-03T00:00:00.000Z',
      workflowDir: TEAM,
      steps: { write: { taskId: null } },
    }),
  );
  const [write] = (await detailOf(id)).steps;
  assert.equal(write.layers, null);
  assert.ok(write.told?.includes('## What was asked for'), write.told ?? 'null');
});
