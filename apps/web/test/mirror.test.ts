/**
 * The board's run mirror, `src/lib/api/run.gen.ts`, is what Effect generates from the document the api serves (`mirror.ts`): the
 * checked-in file is that text byte for byte, so a change to the run object shows in the mirror's diff, and the mirror's `Run` decodes a
 * run object and refuses another kind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Schema } from 'effect';
import { scratch } from './scratch.ts';
import { documentNow, MIRROR, mirrorOf } from './mirror.ts';

test('the checked-in mirror is what the served document generates', () => {
  const generated = mirrorOf(documentNow(scratch('mirror-')));
  const checkedIn = fs.existsSync(MIRROR) ? fs.readFileSync(MIRROR, 'utf8') : null;
  assert.ok(checkedIn === generated, 'run `npm run mirror` in apps/web to write src/lib/api/run.gen.ts from the served document');
});

/** A run object as today's `Run` says one: two steps, the second waiting on the first, nothing measured yet. */
const sample = () => {
  const timeline = {
    loop: null,
    round: null,
    tasks: 0,
    inFlight: 0,
    queuedMs: 0,
    ranMs: 0,
    wallMs: null,
    queued: '0s',
    ran: '0s',
    wall: '0s',
  };
  return {
    apiVersion: 'nemia/v1',
    kind: 'Run',
    metadata: { name: 'r-1', creationTimestamp: '2026-11-02T10:00:00.000Z', labels: { factory: null, workflow: 'quick' } },
    spec: {
      steps: [
        { name: 'implement', after: [], input: [], loop: null, rounds: null },
        { name: 'review', after: ['implement'], input: ['implement'], loop: null, rounds: null },
      ],
      brief: 'a brief',
      place: 'git',
      repo: '/repo',
      branch: 'main',
    },
    status: {
      status: 'running',
      phase: 'running',
      reason: 'Running',
      on: null,
      via: null,
      moving: true,
      cost: null,
      atWork: null,
      tokens: null,
      waiting: null,
      holding: null,
      toDecide: null,
      graph: { roots: ['implement'], edges: [{ from: 'implement', to: 'review', kind: 'after' }] },
      timeline: { rounds: [], run: timeline, slot: null },
      steps: [
        {
          name: 'implement',
          phase: 'running',
          reason: 'Running',
          status: 'running',
          raise: null,
          timeline: [],
          current: null,
        },
      ],
    },
  };
};

test("the mirror's Run decodes a run object and refuses another kind", async () => {
  const { Run } = await import('../src/lib/api/run.gen.ts');
  const decode = Schema.decodeUnknownExit(Run);
  assert.equal(decode(sample())._tag, 'Success');
  assert.equal(decode({ ...sample(), kind: 'Step' })._tag, 'Failure');
});
