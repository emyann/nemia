/**
 * The shipped command table: no rule of the table broken against the CLI's own verbs and runners, and each command on the api's path,
 * method and status of today, or on the CLI alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLE, commandBreaks } from '../src/runner.ts';
import { RUNS, VERBS } from '../src/cli/main.ts';

test('the shipped table breaks none of its rules against the CLI’s verbs and runners', () => {
  assert.deepEqual(commandBreaks(TABLE, [...VERBS.keys()], [...RUNS.keys()]), []);
});

test('each command is served on the api where it was before the table, the lift of a hold where its route was', () => {
  assert.deepEqual(
    TABLE.map((c) => [c.name, c.route ?? c.only?.side]),
    [
      ['retry', { method: 'POST', path: '/api/runs/:runId/steps/:step/retry', status: 202 }],
      ['approve', { method: 'POST', path: '/api/runs/:runId/steps/:step/approve', status: 202 }],
      ['round', { method: 'POST', path: '/api/runs/:runId/round', status: 202 }],
      ['accept', { method: 'POST', path: '/api/runs/:runId/steps/:step/accept', status: 202 }],
      ['say', { method: 'POST', path: '/api/runs/:runId/steps/:step/say', status: 202 }],
      ['ls', { method: 'GET', path: '/api/runs', status: 200 }],
      ['decide', { method: 'GET', path: '/api/runs/:runId/decision', status: 200 }],
      ['ceilings', { method: 'GET', path: '/api/ceilings', status: 200 }],
      ['agents', { method: 'GET', path: '/api/agents', status: 200 }],
      ['agents card', { method: 'GET', path: '/api/agents/:from/:name/card', status: 200 }],
      ['cancel', 'cli'],
      ['hold', { method: 'DELETE', path: '/api/runs/:runId/hold', status: 200, sets: { off: true } }],
      ['cordon', { method: 'POST', path: '/api/cordon', status: 200 }],
      ['uncordon', { method: 'DELETE', path: '/api/cordon', status: 200 }],
      ['cordoned', { method: 'GET', path: '/api/cordon', status: 200 }],
      ['tick', 'cli'],
      ['up', 'cli'],
      ['watch', 'cli'],
    ],
  );
});

test('every command the api posts or deletes on writes, and the api guards it; the six it gets write nothing', () => {
  assert.deepEqual(
    TABLE.filter((c) => !c.writes).map((c) => c.name),
    ['ls', 'decide', 'ceilings', 'agents', 'agents card', 'cordoned', 'watch'],
  );
  assert.deepEqual(
    TABLE.filter((c) => c.route && c.writes !== (c.route.method !== 'GET')).map((c) => c.name),
    [],
  );
});
