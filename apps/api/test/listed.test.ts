/**
 * A list never carries a file's content (`objects`' `LISTED_WITHOUT`), and the bound measures a page as its endpoint's Schema writes it
 * (`readHandled`, src/objects/answer-bound.ts): a page of agents whose instructions together pass the app's bound answers whole, its items
 * without their instructions or their file's text, and a read of one agent answers them. In a scratch store whose library holds the
 * agents, and an app whose bound (`AnswerBound`) is shortened to sit between the page as it is sent and the page as it is held.
 */
import { root } from './harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import type { Agent, AgentList } from 'objects';
import { AnswerBound } from '../src/layer.ts';
import { appOver, eachTest } from './placed.ts';

const BOUND = 60_000;
const INSTRUCTIONS = 'Write the notes, one fact a line.\n'.repeat(600);

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const app = eachTest(() => appOver(standIn(), stand(), Layer.succeed(AnswerBound)(BOUND)));

const agents = path.join(root, 'workflows', 'agents');
fs.mkdirSync(agents, { recursive: true });
for (let n = 0; n < 8; n++) fs.writeFileSync(path.join(agents, `scribe-${n}.md`), `---\ndescription: Scribe ${n}.\n---\n${INSTRUCTIONS}`);

test('a page of agents whose instructions pass the bound answers, its items without their files; a read of one carries them', async () => {
  assert.ok(INSTRUCTIONS.length * 8 > BOUND, 'the instructions together pass the bound');
  const res = await app().request('/api/agents?origin=user');
  assert.equal(res.status, 200);
  const page = (await res.json()) as AgentList;
  assert.equal(page.items.filter((a) => a.metadata.name.startsWith('scribe-')).length, 8);
  for (const item of page.items) {
    assert.equal('instructions' in item.spec, false, `${item.metadata.name}: no instructions in a list`);
    assert.equal('source' in item.status, false, `${item.metadata.name}: no file in a list`);
  }
  const one = await app().request('/api/agents/scribe-0?origin=user');
  assert.equal(one.status, 200);
  const agent = (await one.json()) as Agent;
  assert.equal(agent.spec.instructions?.trim(), INSTRUCTIONS.trim());
  assert.ok(agent.status.source.includes('Scribe 0.'));
});
