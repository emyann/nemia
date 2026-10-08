import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HARNESS_CHOICES, HARNESS_KNOBS } from './choices.ts';
import { CLAUDE_OWNED_FLAGS } from './claude/vocabulary.ts';

test('HARNESS_KNOBS names the harnesses HARNESS_CHOICES does, each with the effort and the fence words HARNESS_CHOICES gives it', () => {
  assert.deepEqual(Object.keys(HARNESS_KNOBS).sort(), Object.keys(HARNESS_CHOICES.effort).sort());
  for (const [harness, knobs] of Object.entries(HARNESS_KNOBS)) {
    assert.equal(knobs.effort, HARNESS_CHOICES.effort[harness], harness);
    const fence = HARNESS_CHOICES.permissionMode[harness] ? 'permissionMode' : 'sandbox';
    assert.equal(knobs.fence.key, fence, harness);
    assert.equal(knobs.fence.words, HARNESS_CHOICES[fence][harness], harness);
  }
});

test('a harness fenced by its permission mode takes the tool lists, a context window and any flag but those the runtime owns', () => {
  for (const [harness, knobs] of Object.entries(HARNESS_KNOBS)) {
    const moded = knobs.fence.key === 'permissionMode';
    assert.deepEqual(knobs.fence.lists, moded ? ['tools', 'allowedTools', 'disallowedTools'] : [], harness);
    assert.equal(knobs.context, moded, harness);
    if (moded) assert.equal('owned' in knobs.flags && knobs.flags.owned, CLAUDE_OWNED_FLAGS, harness);
    else assert.deepEqual(knobs.flags, { only: ['trustFrom'] }, harness);
  }
});
