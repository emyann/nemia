/**
 * The calls a try was refused and the skills it loaded (`discipline.ts`): every call of every ended attempt, one per call, measured only
 * on a harness whose sessions record them; every skill of every ended attempt, measured only where each ended attempt says.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS_SINCE, deniedCallsOf, deniesRecorded, ranAsJob, skillsLoadedOf } from './discipline.ts';

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

test('a session filed before steps ran as jobs records no denial, nor one whose filing and spawn are unknown', () => {
  const before = new Date(Date.parse(JOBS_SINCE) - 1000).toISOString();
  const after = new Date(Date.parse(JOBS_SINCE) + 1000).toISOString();
  assert.equal(ranAsJob({ filedAt: before, spawnedAt: after }), false, 'filed before: a background session, whenever it spawned');
  assert.equal(ranAsJob({ filedAt: JOBS_SINCE, spawnedAt: JOBS_SINCE }), true);
  assert.equal(ranAsJob({ filedAt: after, spawnedAt: after }), true);
  assert.equal(ranAsJob({ filedAt: null, spawnedAt: before }), false, 'with no filing known, its spawn says');
  assert.equal(ranAsJob({ filedAt: null, spawnedAt: after }), true);
  assert.equal(ranAsJob({ filedAt: null, spawnedAt: null }), false);
});

test('every ended attempt gives each skill it loaded, one per load, in order; an attempt not ended gives none', () => {
  const attempts = [
    { ended: 'failed', skills: ['look'] },
    { ended: 'done', skills: ['look', 'effect'] },
    { ended: null, skills: ['x'] },
  ];
  assert.deepEqual(skillsLoadedOf({ state: { attempts } }), ['look', 'look', 'effect']);
  const empty = [{ ended: 'done', skills: [] }, { ended: null }];
  assert.deepEqual(skillsLoadedOf({ state: { attempts: empty } }), [], 'a session that loaded none is a measured empty list');
});

test('a session is unmeasured where one ended attempt does not say its skills, where none ended, and with no view', () => {
  const unsaid = [{ ended: 'failed', skills: ['look'] }, { ended: 'done' }];
  assert.equal(skillsLoadedOf({ state: { attempts: unsaid } }), null, 'one end without the key: not measured, never its others alone');
  assert.equal(skillsLoadedOf({ state: { attempts: [{ ended: null, skills: ['look'] }] } }), null, 'no attempt ended');
  assert.equal(skillsLoadedOf({ state: { attempts: [] } }), null);
  assert.equal(skillsLoadedOf(undefined), null);
});
