/**
 * The calls a try was refused (`discipline.ts`): every call of every ended attempt, one per call, and measured only on a harness whose
 * sessions record them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deniedCallsOf, deniesRecorded } from './discipline.ts';

const write = { tool: 'Write', what: '/x' };
const push = { tool: 'Bash', what: 'git push' };

test('every ended attempt gives each call it was denied, one per call, in order; an attempt not ended gives none', () => {
  const view = {
    state: {
      attempts: [
        { ended: 'done', denials: [write] },
        { ended: 'failed', denials: [write, push] },
        { ended: null, denials: [push] },
      ],
    },
  };
  assert.deepEqual(deniedCallsOf(view), [write, write, push]);
  assert.deepEqual(deniedCallsOf({ state: { attempts: [{ ended: 'done' }] } }), [], 'a session denied nothing');
  assert.deepEqual(deniedCallsOf(undefined), []);
});

test('a step on codex, on a remote agent or in the background records no denial; a job on claude or claude-detached does', () => {
  assert.equal(deniesRecorded({ harness: 'codex' }), false);
  assert.equal(deniesRecorded({ harness: 'a2a:x' }), false);
  assert.equal(deniesRecorded({ background: true }), false);
  assert.equal(deniesRecorded({ harness: 'claude', background: true }), false);
  assert.equal(deniesRecorded({}), true, 'no harness: is the default, claude');
  assert.equal(deniesRecorded({ harness: 'claude' }), true);
  assert.equal(deniesRecorded({ harness: 'claude-detached' }), true);
});
