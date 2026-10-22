/**
 * What a step was told, by layer, as the run page reads it (`GET /api/runs/:id`, `layers`): each layer from what the run froze at
 * `nemia start` — the agent's instructions and skills, the person's custom instructions, the factory's rules, the step's note, the skill
 * and the deny its line adds, and the task — never from the agent's, the custom instructions', the rules' or the step's file as it is
 * now; and none for a record that froze no workflow.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDetail } from '../src/detail/detail.ts';
import { app } from '../src/app.ts';
import { addFactory, attachWorkflow, startRun, engine } from 'agent-orchestrator';
import { PRECEDENCE } from 'agent-orchestrator/run';
import { runWith } from './shipped-place.ts';
import { scratch } from './scratch.ts';

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
fs.writeFileSync(STEP, '---\nworkspace: folder\nagent: layered\nskills: alpha, gamma\ndisallowedTools: WebFetch\n---\nWrite the note.\n');

/** The run `id` in full, as the board reads it. */
const detailOf = async (id: string): Promise<RunDetail> => {
  const res = await app.request(`/api/runs/${id}`);
  assert.equal(res.status, 200);
  return (await res.json()) as RunDetail;
};

test('each layer is answered as the run froze it: an edit of the agent, its custom instructions or the step since reaches none', async () => {
  const run = await runWith(engine(), startRun({ brief: 'Write a note.', repo: '', workflowDir: TEAM }));
  fs.writeFileSync(AGENT, '---\ndescription: Use this to write.\n---\nYou are someone else now.\n');
  fs.writeFileSync(CUSTOM, 'Be verbose.\n');
  fs.writeFileSync(STEP, '---\nworkspace: folder\nagent: layered\n---\nWrite an essay.\n');
  const [write] = (await detailOf(run.id)).steps;
  assert.deepEqual(write.layers && { ...write.layers, task: undefined }, {
    agent: 'layered',
    instructions: 'You are the writer.',
    custom: 'Be terse.',
    factory: null,
    agentSkills: ['alpha'],
    policy: 'Write the note.',
    addedSkills: ['gamma'],
    fence: [{ key: 'disallowedTools', value: 'WebFetch' }],
    folderFiles: true,
    task: undefined,
    via: 'prompt',
  });
  assert.ok(write.told?.startsWith(`${PRECEDENCE}\n\nWrite the note.\n\n## What was asked for`), write.told ?? 'null');
  assert.equal(
    write.layers?.task,
    write.told?.slice(`${PRECEDENCE}\n\nWrite the note.\n\n`.length),
    "a step not filed: the task is its preview's, after the note",
  );
});

test('a run started in a factory with rules answers them as a layer of their own, as it froze them: an edit or a removal since reaches none', async () => {
  fs.writeFileSync(STEP, '---\nworkspace: folder\nagent: layered\n---\nWrite the note.\n');
  addFactory({ name: 'ruled', repos: [scratch('nemia-api-layers-ruled-')] });
  attachWorkflow({ factory: 'ruled', workflow: 'layers' });
  const rules = (method: string, words?: string) =>
    app.request('/api/factories/ruled/rules', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(words === undefined ? {} : { words }),
    });
  assert.equal((await rules('PUT', 'Never push on a Friday.')).status, 200);
  const start = () => runWith(engine(), startRun({ brief: 'Write a note.', repo: '', workflowDir: TEAM, factory: 'ruled' }));
  const run = await start();
  for (const edit of [() => rules('PUT', 'Push whenever.'), () => rules('DELETE')]) {
    assert.equal((await edit()).status, 200);
    const [write] = (await detailOf(run.id)).steps;
    assert.equal(write.layers?.factory, 'Never push on a Friday.');
    assert.equal(write.layers?.custom, 'Be verbose.');
    assert.equal(write.layers?.policy, 'Write the note.');
    assert.equal(write.layers?.task?.includes('Never push'), false, 'the rules are not said again in the task');
  }
  const [after] = (await detailOf((await start()).id)).steps;
  assert.equal(after.layers?.factory, null, 'a run started once they are removed is told none');
});

test('a record that froze no workflow answers no layers, and still what it was told', async () => {
  const id = 'layers-unfrozen';
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
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
